import config from '../config/config'
import loadscript from './loadscript'
import Timeline from '../group/timeline'
import debug from './debug'
import { isFunction } from './is'
import { isBrowser } from './context'

/**
 * Check on GSAP presence
 *
 * @returns {boolean}
 */
export function has() {
  return isFunction(config.gsap.tween) && isFunction(config.gsap.timeline)
}

/**
 * Ensure GSAP is loaded
 * Auto inject
 *
 * @returns {Promise<void>}
 */
export function ensure() {
  if (has()) {
    return Promise.resolve()
  }

  // has gsap on window object?
  const wTween = window.TweenMax || window.TweenLite
  const wTimeline = window.TimelineMax || window.TimelineLite

  if (isBrowser() && isFunction(wTween) && isFunction(wTimeline)) {
    config.gsap.tween = wTween
    config.gsap.timeline = wTimeline

    return Promise.resolve()
  }

  // load from cdn
  if (!config.gsap.autoInject) {
    if (debug()) {
      console.warn(`
      
        It seems that you've disabled autoInject. GSAP cannot be found or loaded by Spirit.
        Please make sure you provide the tween and timeline to Spirit:
      
        spirit.setup({
          tween: TweenMax,
          timeline: TimelineMax
        })
        
        Or enable the autoInject "spirit.config.gsap.autoInject = true".
        
      `)
    }

    return Promise.reject(new Error('GSAP not found.'))
  }

  if (debug()) {
    console.warn(`
      
      GSAP is being fetched from CDN: ${config.gsap.autoInjectUrl}.
      If you already have GSAP installed, please provide it to Spirit:
      
        spirit.setup({
          tween: TweenMax,
          timeline: TimelineMax
        })
      
      You want to use another cdn? Change it here:
       
        spirit.config.gsap.autoInjectUrl = 'https://cdn.xxx'
      
    `)
  }

  return this.loadFromCDN()
}

/**
 * Load GSAP from CDN based on autoInjectUrl
 *
 * @return {Promise<void>}
 */
export function loadFromCDN() {
  return loadscript(config.gsap.autoInjectUrl)
    .then(() => {
      config.gsap.tween = window.TweenMax
      config.gsap.timeline = window.TimelineMax

      return Promise.resolve()
    }).catch(err => {
      return Promise.reject(err)
    })
}

/**
 * Get transform origins for timeline
 *
 * @param {Timeline} timeline
 * @return {Function}
 */
export function transformOrigins(timeline) {
  const prop = timeline.props.get('transformOrigin')
  let origins = (prop && prop.keyframes.list.map(k => ({ time: k.time, value: k.value }))) || []

  // add start 50% 50% ?
  if (origins.length > 0 && origins[0].time !== 0 || origins.length === 0) {
    origins.unshift({ time: 0, value: '50% 50%' })
  }

  let current = origins.shift()

  let next, getVal

  getVal = () => ({ current, next })

  next = () => {
    current = (origins && origins.length > 0 && origins.shift()) || null
    return getVal()
  }

  return getVal()
}

/**
 * Generate timeline from data
 *
 * @param {Timeline} timeline
 * @returns {TimelineMax|TimelineLite}
 */
export function generateTimeline(timeline) {
  if (!timeline || !(timeline instanceof Timeline)) {
    throw new Error('Need valid timeline data to generate GSAP timeline from')
  }

  if (timeline.type !== 'dom') {
    throw new Error('Timeline invalid. Needs a timeline with type of dom.')
  }

  if (!has()) {
    throw new Error('GSAP not set. Please make sure GSAP is available.')
  }

  const tl = new config.gsap.timeline({ paused: true }) // eslint-disable-line new-cap

  const origins = transformOrigins(timeline)
  let origin = origins.current

  timeline.props.each(prop => {
    if (prop.keyframes.length === 0 || prop.name === 'transformOrigin' || prop.name === 'svgOrigin') {
      return
    }

    let keyframe = prop.keyframes.at(0)

    while (keyframe) {
      const { value, ease, time } = keyframe
      const prev = keyframe.prev()

      const start = prev ? prev.time : 0
      const duration = prev ? time - prev.time : time

      let props = { ease: ease || 'Linear.easeNone' }
      let property = { [prop.name]: value }

      // parse dots into recursive object
      if (/\./.test(prop.name)) {
        let segments = prop.name.split('.')
        let last = segments.pop()
        let obj = {}
        let o = obj

        while (segments.length > 0) {
          let segment = segments.shift()

          obj[segment] = {}
          obj = obj[segment]
        }

        obj[last] = value
        property = o
      }

      props = { ...props, ...property }

      if (time === 0) {
        props.immediateRender = true
      }

      if (prop.isCSSTransform() && origin && time >= origin.time) {
        props.transformOrigin = origin.value
        origin = origins.next().current
      }

      tl.to(timeline.transformObject, duration, props, start)

      keyframe = keyframe.next()
    }
  })

  return tl
}

/**
 * Recursively kill timeline
 * Reset props on targets
 *
 * @param {TimelineMax|TimelineLite} gsapTimeline
 */
export function killTimeline(gsapTimeline) {
  if (isTimeline(gsapTimeline)) {
    gsapTimeline.eventCallback('onComplete', null)
    gsapTimeline.eventCallback('onUpdate', null)
    gsapTimeline.eventCallback('onStart', null)

    const targets = gsapTimeline.getChildren()
    gsapTimeline.kill()

    for (let i = 0; i < targets.length; i++) {
      if (isTimeline(targets[i])) {
        killTimeline(targets[i])
        continue
      }

      if (targets[i].target !== null) {
        config.gsap.tween.set(targets[i].target, { clearProps: 'all' })
      }
    }
    gsapTimeline.clear()
  }

  return gsapTimeline
}

export function isTimeline(timeline) {
  return timeline && isFunction(config.gsap.timeline) && timeline instanceof config.gsap.timeline
}

export function isTween(tween) {
  return tween && isFunction(config.gsap.tween) && tween instanceof config.gsap.tween
}
