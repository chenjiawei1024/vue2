// Provides transition support for a single element/component.
// supports transition mode (out-in / in-out)
//为单个元素/组件提供转换支持。 
//支持过渡模式(out-in / in-out)

import { warn } from 'core/util/index'
import { camelize, extend, isPrimitive } from 'shared/util'
import {
  mergeVNodeHook,
  isAsyncPlaceholder,
  getFirstComponentChild
} from 'core/vdom/helpers/index'
import VNode from 'core/vdom/vnode'
import type { Component } from 'typescript/component'

export const transitionProps = {
  name: String,
  appear: Boolean,
  css: Boolean,
  mode: String,
  type: String,
  enterClass: String,
  leaveClass: String,
  enterToClass: String,
  leaveToClass: String,
  enterActiveClass: String,
  leaveActiveClass: String,
  appearClass: String,
  appearActiveClass: String,
  appearToClass: String,
  duration: [Number, String, Object]
}

// in case the child is also an abstract component, e.g. <keep-alive>
// we want to recursively retrieve the real component to be rendered
function getRealChild(vnode?: VNode): VNode | undefined {
  const compOptions = vnode && vnode.componentOptions
  if (compOptions && compOptions.Ctor.options.abstract) {
    return getRealChild(getFirstComponentChild(compOptions.children))
  } else {
    return vnode
  }
}

export function extractTransitionData(comp: Component): Record<string, any> {
  const data = {}
  const options = comp.$options
  // props
  for (const key in options.propsData) {
    data[key] = comp[key]
  }
  // events.
  // extract listeners and pass them directly to the transition methods
  const listeners = options._parentListeners
  for (const key in listeners) {
    data[camelize(key)] = listeners[key]
  }
  return data
}

function placeholder(h: Function, rawChild: VNode): VNode | undefined {
  // @ts-expect-error
  if (/\d-keep-alive$/.test(rawChild.tag)) {
    return h('keep-alive', {
      props: rawChild.componentOptions!.propsData
    })
  }
}

function hasParentTransition(vnode: VNode): boolean | undefined {
  while ((vnode = vnode.parent!)) {
    if (vnode.data!.transition) {
      return true
    }
  }
}

function isSameChild(child: VNode, oldChild: VNode): boolean {
  return oldChild.key === child.key && oldChild.tag === child.tag
}

const isNotTextNode = (c: VNode) => c.tag || isAsyncPlaceholder(c)

const isVShowDirective = d => d.name === 'show'

export default {
  name: 'transition',
  props: transitionProps,
  abstract: true,

  render(h: Function) {
    // 利用slot的default 获取子节点
    let children: any = this.$slots.default
    // 子节点不存在则返回
    if (!children) {
      return
    }

    // filter out text nodes (possible whitespaces)
    // 过滤文本节点(可能的空白)
    children = children.filter(isNotTextNode)
    /* istanbul ignore if */
    //过滤之后不存在子节点直接返回
    if (!children.length) {
      return
    }

    // warn multiple elements
    // 警告多个元素
    if (__DEV__ && children.length > 1) {
      warn(
        '<transition> can only be used on a single element. Use ' +
          '<transition-group> for lists.',
        this.$parent
      )
    }

    const mode: string = this.mode

    // warn invalid mode
    //警告无效的模式
    if (__DEV__ && mode && mode !== 'in-out' && mode !== 'out-in') {
      warn('invalid <transition> mode: ' + mode, this.$parent)
    }

    const rawChild: VNode = children[0]

    // if this is a component root node and the component's
    // parent container node also has transition, skip.
    // 如果这是一个组件的根节点，并且该组件的父容器节点也有转换，请跳过。
    if (hasParentTransition(this.$vnode)) {
      return rawChild
    }

    // apply transition data to child
    // use getRealChild() to ignore abstract components e.g. keep-alive
    // 使用getRealChild()忽略抽象组件
    const child = getRealChild(rawChild)
    /* istanbul ignore if */
    if (!child) {
      return rawChild
    }

    //out-in模式下如果一个keep-alive 返回一个占位符
    if (this._leaving) {
      return placeholder(h, rawChild)
    }

    // ensure a key that is unique to the vnode type and to this transition
    // component instance. This key will be used to remove pending leaving nodes
    // during entering.
    // 处理id和data
    const id: string = `__transition-${this._uid}-`
    child.key =
      child.key == null
        ? child.isComment
          ? id + 'comment'
          : id + child.tag
        : isPrimitive(child.key)
        ? String(child.key).indexOf(id) === 0
          ? child.key
          : id + child.key
        : child.key

    const data: Object = ((child.data || (child.data = {})).transition =
      extractTransitionData(this))
    const oldRawChild: VNode = this._vnode
    const oldChild = getRealChild(oldRawChild)

    // mark v-show
    // so that the transition module can hand over the control to the directive
    // 标记 v-show
    // 这样过渡模块就可以把控制权交给指令
    if (child.data.directives && child.data.directives.some(isVShowDirective)) {
      child.data.show = true
    }

    if (
      oldChild &&
      oldChild.data &&
      !isSameChild(child, oldChild) &&
      !isAsyncPlaceholder(oldChild) &&
      // #6687 component root is a comment node
      !(
        oldChild.componentInstance &&
        oldChild.componentInstance._vnode!.isComment
      )
    ) {
      // replace old child transition data with fresh one
      // important for dynamic transitions!
      const oldData: Object = (oldChild.data.transition = extend({}, data))
      // handle transition mode
      // 处理过渡模式
      if (mode === 'out-in') {
        // return placeholder node and queue update when leave finishes
        // 当leave完成时返回占位符节点和队列的更新
        this._leaving = true
        mergeVNodeHook(oldData, 'afterLeave', () => {
          this._leaving = false
          this.$forceUpdate()
        })
        return placeholder(h, rawChild)
      } else if (mode === 'in-out') {
        if (isAsyncPlaceholder(child)) {
          return oldRawChild
        }
        let delayedLeave
        const performLeave = () => {
          delayedLeave()
        }
        mergeVNodeHook(data, 'afterEnter', performLeave)
        mergeVNodeHook(data, 'enterCancelled', performLeave)
        mergeVNodeHook(oldData, 'delayLeave', leave => {
          delayedLeave = leave
        })
      }
    }

    return rawChild
  }
}
