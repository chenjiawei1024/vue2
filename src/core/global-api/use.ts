import type { GlobalAPI } from 'typescript/global-api'
import { toArray } from '../util/index'

export function initUse(Vue: GlobalAPI) {
  Vue.use = function (plugin: Function | any) {
    // 创建插件数组
    const installedPlugins =
      this._installedPlugins || (this._installedPlugins = [])
    // 判断插件是否存在于数组中，若是，则直接返回，防止重复安装
    if (installedPlugins.indexOf(plugin) > -1) {
      return this
    }

    // additional parameters
    // 获取到传入的其余参数，并且使用toArray方法将其转换成数组
    const args = toArray(arguments, 1)
    // 同时将Vue插入到该数组的第一个位置，这是因为在后续调用install方法时，Vue必须作为第一个参数传入
    args.unshift(this)
    // 若传入的plugin为对象且提供了install方法，则执行该install方法并传入参数完成插件安装
    if (typeof plugin.install === 'function') {
      plugin.install.apply(plugin, args)
    // 如果传入的插件是一个函数，那么就把这个函数当作install方法执行，同时传入参数完成插件安装
    } else if (typeof plugin === 'function') {
      plugin.apply(null, args)
    }
    // 将该插件传入插件数组中，防止重复安装。
    installedPlugins.push(plugin)
    return this
  }
}
