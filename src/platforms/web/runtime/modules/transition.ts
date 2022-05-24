import { inBrowser, isIE9, warn } from 'core/util/index'
import { mergeVNodeHook } from 'core/vdom/helpers/index'
import { activeInstance } from 'core/instance/lifecycle'

import { once, isDef, isUndef, isObject, toNumber } from 'shared/util'

import {
  nextFrame,
  resolveTransition,
  whenTransitionEnds,
  addTransitionClass,
  removeTransitionClass
} from 'web/runtime/transition-util'

import type { VNodeWithData } from 'typescript/vnode'
import VNode from 'core/vdom/vnode'

export function enter(vnode: VNodeWithData, toggleDisplay?: () => void) {
  // 获取真实dom元素
  const el: any = vnode.elm

  // call leave callback now
  // 如果元素存在_leaveCb函数，直接调用
  // 设置el.leaveCb.cancelled为true
  if (isDef(el._leaveCb)) {
    el._leaveCb.cancelled = true
    el._leaveCb()
  }

  // name - string. 用于自动生成css过渡类名
  // 默认类名为"v"
  // 如果有用户定义的类名会覆盖
  const data = resolveTransition(vnode.data.transition)
  if (isUndef(data)) {
    return
  }

  /* istanbul ignore if */
  // 有_enterCb回调或者非元素节点直接结束
  if (isDef(el._enterCb) || el.nodeType !== 1) {
    return
  }

  // 获取用户自定义的css名和一系列回调函数
  const {
    css,
    type,
    enterClass,
    enterToClass,
    enterActiveClass,
    appearClass,
    appearToClass,
    appearActiveClass,
    beforeEnter,
    enter,
    afterEnter,
    enterCancelled,
    beforeAppear,
    appear,
    afterAppear,
    appearCancelled,
    duration
  } = data

  // activeInstance will always be the <transition> component managing this
  // transition. One edge case to check is when the <transition> is placed
  // as the root node of a child component. In that case we need to check
  // <transition>'s parent for appear check.

  // activeInstance为全变量，为当前激活的组件，这里是transition组件
  let context = activeInstance
  // 获取transition组件的占位符节点
  let transitionNode = activeInstance.$vnode
  // 同transition组件hasParentTransition函数类似
  // 一直获取到占位符节点的父组件（context）
  while (transitionNode && transitionNode.parent) {
    context = transitionNode.context
    transitionNode = transitionNode.parent
  }

  // isAppear：是否为首次挂载
  const isAppear = !context._isMounted || !vnode.isRootInsert
  // apper 默认为false，默认第一次渲染的时候不触发过度效果
  if (isAppear && !appear && appear !== '') {
    return
  }

  // 解析Class名称以及回调函数
  const startClass = isAppear && appearClass ? appearClass : enterClass
  const activeClass =
    isAppear && appearActiveClass ? appearActiveClass : enterActiveClass
  const toClass = isAppear && appearToClass ? appearToClass : enterToClass

  const beforeEnterHook = isAppear ? beforeAppear || beforeEnter : beforeEnter
  const enterHook = isAppear
    ? typeof appear === 'function'
      ? appear
      : enter
    : enter
  const afterEnterHook = isAppear ? afterAppear || afterEnter : afterEnter
  const enterCancelledHook = isAppear
    ? appearCancelled || enterCancelled
    : enterCancelled

  // 用户定义的延迟执行时间
  const explicitEnterDuration: any = toNumber(
    isObject(duration) ? duration.enter : duration
  )

  if (__DEV__ && explicitEnterDuration != null) {
    checkDuration(explicitEnterDuration, 'enter', vnode)
  }

  // 是否使用css实现过渡动画，默认为true
  const expectsCSS = css !== false && !isIE9

  // 根据enterHook参数数量，判断是否为用户控制过渡
  // 参数为两个的时候表示用户想自己控制
  const userWantsControl = getHookArgumentsLength(enterHook)

  // 定义el._enterCb回调函数，函数只执行一次（once）
  //1.非用户控制过渡：transition/animation事件完成后执行回调；
  // 2.非用户控制过渡：在定义的延迟时机后执行回调
  // 3. 节点移除的时候如果el._enterCb!==null 执行回调
  // 4. 与v-show有关，data.show为false/undefined时，在节点insert的时候执行回调
  // 5. v-show为true的时候立刻执行回调
  const cb = (el._enterCb = once(() => {
    if (expectsCSS) {
      removeTransitionClass(el, toClass)
      removeTransitionClass(el, activeClass)
    }
    // @ts-expect-error
    if (cb.cancelled) {
      if (expectsCSS) {
        removeTransitionClass(el, startClass)
      }
      enterCancelledHook && enterCancelledHook(el)
    } else {
      afterEnterHook && afterEnterHook(el)
    }
    el._enterCb = null
  }))

  if (!vnode.data.show) {
    // remove pending leave element on enter by injecting an insert hook
    mergeVNodeHook(vnode, 'insert', () => {
      const parent = el.parentNode
      const pendingNode =
        parent && parent._pending && parent._pending[vnode.key!]
      if (
        pendingNode &&
        pendingNode.tag === vnode.tag &&
        pendingNode.elm._leaveCb
      ) {
        pendingNode.elm._leaveCb()
      }
      enterHook && enterHook(el, cb)
    })
  }

  // start enter transition
  beforeEnterHook && beforeEnterHook(el)
  if (expectsCSS) {
    addTransitionClass(el, startClass)
    addTransitionClass(el, activeClass)
    nextFrame(() => {
      removeTransitionClass(el, startClass)
      // @ts-expect-error
      if (!cb.cancelled) {
        addTransitionClass(el, toClass)
        if (!userWantsControl) {
          if (isValidDuration(explicitEnterDuration)) {
            setTimeout(cb, explicitEnterDuration)
          } else {
            whenTransitionEnds(el, type, cb)
          }
        }
      }
    })
  }

  if (vnode.data.show) {
    toggleDisplay && toggleDisplay()
    enterHook && enterHook(el, cb)
  }

  if (!expectsCSS && !userWantsControl) {
    cb()
  }
}

export function leave(vnode: VNodeWithData, rm: Function) {
  const el: any = vnode.elm

  // call enter callback now
  if (isDef(el._enterCb)) {
    el._enterCb.cancelled = true
    el._enterCb()
  }

  const data = resolveTransition(vnode.data.transition)
  if (isUndef(data) || el.nodeType !== 1) {
    return rm()
  }

  /* istanbul ignore if */
  if (isDef(el._leaveCb)) {
    return
  }

  const {
    css,
    type,
    leaveClass,
    leaveToClass,
    leaveActiveClass,
    beforeLeave,
    leave,
    afterLeave,
    leaveCancelled,
    delayLeave,
    duration
  } = data

  const expectsCSS = css !== false && !isIE9
  const userWantsControl = getHookArgumentsLength(leave)

  const explicitLeaveDuration: any = toNumber(
    isObject(duration) ? duration.leave : duration
  )

  if (__DEV__ && isDef(explicitLeaveDuration)) {
    checkDuration(explicitLeaveDuration, 'leave', vnode)
  }

  const cb = (el._leaveCb = once(() => {
    if (el.parentNode && el.parentNode._pending) {
      el.parentNode._pending[vnode.key!] = null
    }
    if (expectsCSS) {
      removeTransitionClass(el, leaveToClass)
      removeTransitionClass(el, leaveActiveClass)
    }
    // @ts-expect-error
    if (cb.cancelled) {
      if (expectsCSS) {
        removeTransitionClass(el, leaveClass)
      }
      leaveCancelled && leaveCancelled(el)
    } else {
      rm()
      afterLeave && afterLeave(el)
    }
    el._leaveCb = null
  }))

  if (delayLeave) {
    delayLeave(performLeave)
  } else {
    performLeave()
  }

  function performLeave() {
    // the delayed leave may have already been cancelled
    // @ts-expect-error
    if (cb.cancelled) {
      return
    }
    // record leaving element
    if (!vnode.data.show && el.parentNode) {
      ;(el.parentNode._pending || (el.parentNode._pending = {}))[vnode.key!] =
        vnode
    }
    beforeLeave && beforeLeave(el)
    if (expectsCSS) {
      addTransitionClass(el, leaveClass)
      addTransitionClass(el, leaveActiveClass)
      nextFrame(() => {
        removeTransitionClass(el, leaveClass)
        // @ts-expect-error
        if (!cb.cancelled) {
          addTransitionClass(el, leaveToClass)
          if (!userWantsControl) {
            if (isValidDuration(explicitLeaveDuration)) {
              setTimeout(cb, explicitLeaveDuration)
            } else {
              whenTransitionEnds(el, type, cb)
            }
          }
        }
      })
    }
    leave && leave(el, cb)
    if (!expectsCSS && !userWantsControl) {
      cb()
    }
  }
}

// only used in dev mode
function checkDuration(val, name, vnode) {
  if (typeof val !== 'number') {
    warn(
      `<transition> explicit ${name} duration is not a valid number - ` +
        `got ${JSON.stringify(val)}.`,
      vnode.context
    )
  } else if (isNaN(val)) {
    warn(
      `<transition> explicit ${name} duration is NaN - ` +
        'the duration expression might be incorrect.',
      vnode.context
    )
  }
}

function isValidDuration(val) {
  return typeof val === 'number' && !isNaN(val)
}

/**
 * Normalize a transition hook's argument length. The hook may be:
 * - a merged hook (invoker) with the original in .fns
 * - a wrapped component method (check ._length)
 * - a plain function (.length)
 */
function getHookArgumentsLength(fn: Function): boolean {
  if (isUndef(fn)) {
    return false
  }
  // @ts-expect-error
  const invokerFns = fn.fns
  if (isDef(invokerFns)) {
    // invoker
    return getHookArgumentsLength(
      Array.isArray(invokerFns) ? invokerFns[0] : invokerFns
    )
  } else {
    // @ts-expect-error
    return (fn._length || fn.length) > 1
  }
}

function _enter(_: any, vnode: VNodeWithData) {
  if (vnode.data.show !== true) {
    enter(vnode)
  }
}

export default inBrowser
  ? {
      create: _enter,
      activate: _enter,
      remove(vnode: VNode, rm: Function) {
        /* istanbul ignore else */
        if (vnode.data!.show !== true) {
          // @ts-expect-error
          leave(vnode, rm)
        } else {
          rm()
        }
      }
    }
  : {}
