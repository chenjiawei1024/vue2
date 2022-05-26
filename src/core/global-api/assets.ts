import { ASSET_TYPES } from 'shared/constants'
import type { GlobalAPI } from 'typescript/global-api'
import { isPlainObject, validateComponentName } from '../util/index'

export function initAssetRegisters(Vue: GlobalAPI) {
  /**
   * Create asset registration methods.
   */
  ASSET_TYPES.forEach(type => {
    // @ts-expect-error function is not exact same type
    Vue[type] = function (
      id: string,
      definition?: Function | Object
    ): Function | Object | void {
      // 如果不存在definition，则视为获取（组件/指令/过滤器）,否则存入
      if (!definition) {
        return this.options[type + 's'][id]
      } else {
        /* istanbul ignore if */
        if (__DEV__ && type === 'component') {
          validateComponentName(id)
        }
        if (type === 'component' && isPlainObject(definition)) {
          // 判断传入的definition参数是否是一个对象，如果是对象，则使用Vue.extend方法将其变为Vue的子类
          // 如果definition对象中不存在name属性时，则使用组件id作为组件的name属性
          // @ts-expect-error
          definition.name = definition.name || id
          definition = this.options._base.extend(definition)
        }
        if (type === 'directive' && typeof definition === 'function') {
          definition = { bind: definition, update: definition }
        }
        // 将注册好的组件保存在this.options['components']中
        this.options[type + 's'][id] = definition
        return definition
      }
    }
  })
}
