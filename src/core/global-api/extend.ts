import { ASSET_TYPES } from 'shared/constants'
import type { Component } from 'typescript/component'
import type { GlobalAPI } from 'typescript/global-api'
import { defineComputed, proxy } from '../instance/state'
import { extend, mergeOptions, validateComponentName } from '../util/index'

export function initExtend(Vue: GlobalAPI) {
  /**
   * Each instance constructor, including Vue, has a unique
   * cid. This enables us to create wrapped "child
   * constructors" for prototypal inheritance and cache them.
   */
  Vue.cid = 0
  let cid = 1

  /**
   * Class inheritance
   */
  Vue.extend = function (extendOptions: any): typeof Component {
    extendOptions = extendOptions || {}
    // 父类
    const Super = this
    // 父类id
    const SuperId = Super.cid
    // 缓存池，用于缓存创建出来的类
    const cachedCtors = extendOptions._Ctor || (extendOptions._Ctor = {})
    // 如果存在缓存，则直接返回缓存的类
    if (cachedCtors[SuperId]) {
      return cachedCtors[SuperId]
    }

    // 获取name属性 （如果子类有，则获取子嘞name，没有则获取父类的，并且在开发环境下校验name字段是否合法）
    const name = extendOptions.name || Super.options.name
    if (__DEV__ && name) {
      validateComponentName(name)
    }

    // 创建sub子类(构造函数)
    const Sub = function VueComponent(this: any, options: any) {
      this._init(options)
    } as unknown as typeof Component
    // 让该类去继承基础Vue类，让其具备一些基础Vue类的能力(原型继承)
    Sub.prototype = Object.create(Super.prototype) //Sub.prototype.__proto__ === Super.prototype
    // 将构造方法返回的类改为自己
    Sub.prototype.constructor = Sub
    // 为子类添加唯一标识cid
    Sub.cid = cid++
    // 将父类的options与子类的options进行合并，将合并结果赋给子类的options属性
    Sub.options = mergeOptions(Super.options, extendOptions)
    // 将父类保存到子类的super属性中，以确保在子类中能够拿到父类
    Sub['super'] = Super

    // For props and computed properties, we define the proxy getters on
    // the Vue instances at extension time, on the extended prototype. This
    // avoids Object.defineProperty calls for each instance created.
    if (Sub.options.props) {
      initProps(Sub)
    }
    if (Sub.options.computed) {
      initComputed(Sub)
    }

    // allow further extension/mixin/plugin usage
    // 将父类中的一些属性复制到子类
    Sub.extend = Super.extend
    Sub.mixin = Super.mixin
    Sub.use = Super.use

    // create asset registers, so extended classes
    // can have their private assets too.
    ASSET_TYPES.forEach(function (type) {
      Sub[type] = Super[type]
    })
    // enable recursive self-lookup
    if (name) {
      Sub.options.components[name] = Sub
    }

    // keep a reference to the super options at extension time.
    // later at instantiation we can check if Super's options have
    // been updated.
    Sub.superOptions = Super.options
    Sub.extendOptions = extendOptions
    Sub.sealedOptions = extend({}, Sub.options)

    // cache constructor
    cachedCtors[SuperId] = Sub
    return Sub
  }
}

function initProps(Comp: typeof Component) {
  const props = Comp.options.props
  for (const key in props) {
    proxy(Comp.prototype, `_props`, key)
  }
}

function initComputed(Comp: typeof Component) {
  const computed = Comp.options.computed
  for (const key in computed) {
    defineComputed(Comp.prototype, key, computed[key])
  }
}
