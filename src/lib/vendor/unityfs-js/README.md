# unityfs-js (Version 0.2.4)

一个高性能、轻量级的纯 JavaScript 前端 Unity 资源解包与提取库。本库经过重构，移除了工程打包依赖，支持在浏览器和 Node.js 命令行环境（CLI）中无缝运行。

## 目录结构与模块说明

```
unityfs-js/
├── index.js            # 引擎入口文件 (ESM)
├── assetManager.js     # 资源中介者管理器 (AssetManager Facade)
├── core/               # 类型树与基础流解析核心模块
├── exporters/          # 各种资源导出器 (Live2D, Sprite, AudioClip 等)
├── decoders/           # DXT 与 BC7 图像解码驱动
├── fsb5/               # FSB5 音频容器重建与提取
├── wasm/               # WebAssembly 编解码加速驱动 (LZ4/LZMA WASM 编译产物)
├── vendor/             # 外部依赖注入适配器
├── example/            # 命令行演示文件夹 (Node.js)
│   ├── exportLive2dDemo.js   # Live2D 模型及动画 (.motion3.json) 完整导出演示
│   ├── exportImageDemo.js    # Texture2D (图片) 与 Sprite (雪碧图) 导出演示
│   ├── exportAudioDemo.js    # AudioClip (音频) 导出演示
│   ├── exportTextDemo.js     # TextAsset (文本) 导出演示
│   └── exportMeshDemo.js     # 3D Mesh (.obj) 与 SkinnedMeshRenderer (.glb) 导出演示
└── package.json        # NPM 包配置文件
```

## 快速接入与引入

### 1. 浏览器构建环境 (带打包工具 - Vite / Webpack 等)

如果在支持构建打包的项目中，您可以通过 npm 安装包，并直接在代码中通过裸模块名导入：

```bash
npm install unityfs-js
```

```javascript
import { load } from 'unityfs-js'

// 加载一个 Web 服务器上的 AssetBundle
const assetManager = await load('https://example.com/assets.bundle')
```

### 2. 纯原生 HTML 环境 (无打包工具 - Native ES Module)

如果您在纯原生 HTML 网页中开发，无需任何打包构建工具，也可以利用现代浏览器原生支持的 `type="module"` 引入：

#### 方式 A：通过静态文件路径直接引入
将 `unityfs-js` 文件夹拷贝至您的项目静态资源目录下，并在 JS 中直接使用文件的相对或绝对路径引入 [index.js](index.js)：

```html
<script type="module">
  // 直接引入 index.js 文件物理路径
  import { load } from './assets/unityfs-js/index.js'

  const assetManager = await load('./assets.bundle')
  console.log('所有解析对象:', assetManager.getObjectInfos())
</script>
```

#### 方式 B：通过 Import Maps 声明包别名引入
如果您希望在多个 script 标签中统一使用 `import { ... } from 'unityfs-js'` 命名方式，可利用 `<script type="importmap">` 建立映射：

```html
<!-- 1. 在页面头部声明映射关系 -->
<script type="importmap">
  {
    "imports": {
      "unityfs-js": "./assets/unityfs-js/index.js",
      "unityfs-js/exporters/": "./assets/unityfs-js/exporters/"
    }
  }
</script>

<!-- 2. 在业务模块中直接以包名导入 -->
<script type="module">
  import { load } from 'unityfs-js'
  import { processLive2DModel } from 'unityfs-js/exporters/live2dExporter.js'

  const assetManager = await load('./live2d_char.bundle')
  // ... 业务逻辑
</script>
```

### 3. 命令行端 (Node.js - ESM)

在 Node.js 环境下使用该库时，需确保项目 `package.json` 中配置了 `"type": "module"`：

```javascript
import { load } from 'unityfs-js'
import { processLive2DModel } from 'unityfs-js/exporters/live2dExporter.js'
```

### 3. WebAssembly 高性能解压运行时

为了获得高性能的块解压性能（LZ4 与 LZMA 解密），本库已将对应的 WebAssembly 编解码器以二进制 Base64 形式完全内联。

- **开箱即用（Zero-Configuration）**：无需配置任何静态资源拷贝插件（如 `copy-webpack-plugin` 或 `vite-plugin-static-copy`），也无需在 HTML 页面中手动引入任何外部加载脚本。
- **多端自动兼容**：无论是 Web 浏览器端、Node.js 命令行环境（CLI）、Electron 桌面客户端还是 Cordova 移动端，WebAssembly 均会在模块加载时在内存中自动同步编译并启用。
- **安全降级兜底**：若运行环境由于特殊限制（例如 CSP 安全策略）无法加载或不支持 WebAssembly，解析器将自动无缝降级使用纯 JS 实现的慢速解码器，保证业务正常运行。

## 核心 API 使用指南

### 1. 引擎载入与解析 (load)

load(source, options) 为本库的主入口函数，用于解析 Unity 资源包。

- **参数说明**：
    - `source`：支持传入 `string` (资源文件的 URL 地址)、`ArrayBuffer` 或 `Uint8Array` (文件的二进制数据)。
    - `options`：可选配置对象：
        - `unityRevision`：`string`，指定 Unity 的修正版本号（如 `2020.3.17f1`），用于在部分低版本或无版本头信息的资源包中辅助类型树对齐。
        - `sliceBeforeSecondUnityFS`：`boolean`，若资源包头部包含多余垃圾字节或重复的文件头，设为 `true` 可自动扫描并截取第二个 `UnityFS` 标志位之后的数据。
- **返回值**：返回一个 Promise，解析成功后 resolve 实例化后的 `AssetManager` 对象。

```javascript
// 示例 1: 从二进制数据加载
const fileData = await fs.promises.readFile('main.assets')
const assetManager = await load(fileData.buffer, {
    unityRevision: '2019.4.15f1',
})

// 示例 2: 网页端网络请求加载
const assetManager = await load('https://example.com/assets.bundle')
```

### 2. 伴生流式资源文件加载 (registerResourceFile)

在 Unity 引擎打包规则下，大部分流式大型资源（如高分辨率的 `Texture2D` 纹理、较大的 `AudioClip` 音频）其真实二进制数据不会保存在 `.assets` 或 `AssetBundle` 主文件中，而是存储在同目录下的 `.resS` 或 `.resource` 伴生文件中。
在读取这些大文件资源前，必须将其数据注册到 `AssetManager` 中，否则在执行导出时会因为无法寻址对应的数据偏移量而报错或导出空数据。

```javascript
// 加载伴生资源数据
const resSData = await fetch('resources.assets.resS').then((res) => res.arrayBuffer())

// 注册至管理器。注册后，AssetManager 在解析 Texture2D/AudioClip 时会自动关联并截取数据段
assetManager.registerResourceFile('resources.assets.resS', new Uint8Array(resSData))
```

### 3. 三维依赖注入 (setDependencies)

为了保持核心库的轻量 and 无外部 bundler 依赖，针对 3D Mesh（网格）和 SkinnedMeshRenderer（蒙皮渲染器）的 GLTF 级导出，本库采用了依赖注入机制。若需要导出 OBJ 之外 of 3D 网格模型，您必须在初始化阶段注入 Three.js 环境。

```javascript
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { setDependencies } from 'unityfs-js'

// 注入 3D 库依赖项，解析器会在导出 3D 资源时自动调用
setDependencies({ THREE, GLTFExporter })
```

### 4. 插件化自定义类解析器 (registerClass)

针对本库默认不提供深度解析的自定义类（例如开发者自行在 C# 中声明的序列化结构体），您可以通过插件机制注册自定义的解析器。

```javascript
import { registerClass } from 'unityfs-js'

class CustomComponentParser {
    constructor(reader) {
        // 读取并反序列化字段
        this.someValue = reader.readInt32()
        this.someString = reader.readString()
    }
}

// 注册 ClassID 为 114 的自定义类
registerClass(114, 'CustomComponent', CustomComponentParser)
```

### 5. 内存清理与释放 (dispose)

由于解包过程中会产生大量的 `TypedArray` 缓存数据，且涉及 WebAssembly 或大量底层字节流，在提取操作全部结束后，必须调用释放方法以防止浏览器或 Node 内存泄漏。

```javascript
// 清理管理器缓存，切断所有底层 BinaryReader 引用
assetManager.dispose()
```

---

## 资源查询与提取指南

`AssetManager` 提供了丰富的接口对解析出的对象进行过滤和读取。

### 1. 查询对象信息 (ObjectInfo)

解析后的资源在管理器中被称为 `ObjectInfo`。它是一个轻量级的元数据包裹对象，包含 `pathID`、`classID`、`size` 以及资源名称，其实际的序列化数据是按需懒加载的。

- `assetManager.getObjectInfos(filterFunc)`：获取并过滤所有对象信息。
- `assetManager.getObjectInfosByClass(className)`：根据 Unity 类名获取对象（常用类名：`Texture2D`、`Sprite`、`AudioClip`、`MonoBehaviour`、`TextAsset`、`Mesh`）。
- `assetManager.getObjectInfoByPathId(pathId)`：根据唯一的 PathID 检索对象。
- `assetManager.getObjectInfoByName(name)`：根据资源名称精确查找。

### 2. 导出资源文件 (exportFile)

`exportFile(objectInfo, options)` 是数据导出的核心接口。

- **支持的资源类型与输出说明**：
    - `Texture2D` / `Sprite`：支持自动转码并解压 DXT1/5、BC7 等各种压缩纹理格式。并且支持通过 `options.type` 快捷配置直接输出不同格式的数据，无需用户手动转换。可配置的 `type` 格式包括：
      - `'arrayBuffer'` (默认值)：输出 PNG 二进制 `ArrayBuffer` 数据。
      - `'rgbaArray'`：输出解码后未经 PNG 压缩的原始垂直翻转 `RGBA32` 像素字节数组 (`Uint8Array`)。
      - `'canvas'`：直接输出绘制好图像的 HTML5 `<canvas>` 节点 (仅限浏览器环境，若不支持 OffscreenCanvas 则自动回退)。
      - `'offscreenCanvas'`：输出 `OffscreenCanvas` 对象 (仅限浏览器环境)。
      - `'blob'`：输出标准的 PNG `Blob` 物理对象。
      - `'blobURL'`：直接创建并返回对应的 Blob 临时预览 URL 字符串 (`blob:http...`)，可以直接赋值给 `<img>` 标签的 `src` 属性。
      - `'dataURL'`：输出 Base64 格式的 Data URL 字符串 (如 `data:image/png;base64,...`)。
    - **图片编码器设置 (`options.encoder`)**：
      - `'auto'` (默认值)：**智能三级降级**。默认优先使用基于 WebAssembly 的 **LodePNG-WASM** 极速高压缩编码器；若当前环境不支持 WASM 或执行异常，自动降级至浏览器原生 **OffscreenCanvas**；若在无头环境（如 Node.js）中，自动降级至纯 JS 实现的 **UPNG.js** 兜底。
      - `'wasm'`：强制使用 **LodePNG-WASM** 模块进行编码。
      - `'canvas'`：强制使用浏览器/Worker 原生 **OffscreenCanvas** 编码。
      - `'upng'`：强制使用纯 JavaScript 的 **UPNG.js** 编码器。
    - `AudioClip`：支持将 Unity 内存中的 FSB5 等音频容器重建并转码为 `WAV` / `OGG` 格式物理文件。与 `Texture2D` / `Sprite` 类似，它同样支持通过 `options.type` 快捷输出不同的数据格式（`arrayBuffer`, `blob`, `blobURL`, `dataURL`），无需用户手动转换。
    - `TextAsset`：直接提取为原始文本字符串或 ArrayBuffer。
    - `Mesh`：默认导出为标准的 `.obj` 模型文本文件。
    - `SkinnedMeshRenderer`：在注入 `three` 依赖后，自动组装骨骼结构并导出为标准的 `.glb` 二进制骨骼动画模型。

```javascript
// 示例 1: 默认导出 PNG 二进制 ArrayBuffer (使用默认 auto/LodePNG-WASM 编码器)
const textureInfo = assetManager.getObjectInfosByClass('Texture2D')[0]
const file = await assetManager.exportFile(textureInfo)
// 返回结构： { src: "...", data: { raw: ArrayBuffer, width: 512, height: 512 } }

// 示例 2: 指定图片编码器 (如指定为纯 JS 的 UPNG 或浏览器 Canvas)
const upngFile = await assetManager.exportFile(textureInfo, { encoder: 'upng' })

// 示例 3: 快捷导出 Blob URL 直接用于前端 img.src 渲染 (无需手动转换)
const imgUrlFile = await assetManager.exportFile(textureInfo, { type: 'blobURL' })
const imgElement = document.createElement('img')
imgElement.src = imgUrlFile.data.raw // 直接为 blob:http://... 字符串
```

---

## 常用资源提取示例

### 1. 导出 Live2D 模型与动画 (Cubism)

本库对 Live2D 导出链做了深度适配。支持将挂载了 `CubismModel` 的 `MonoBehaviour` 数据转换成 Live2D 标准的 `.moc3` 模型描述文件及动画配置文件：

```javascript
import { processLive2DModel } from 'unityfs-js/exporters/live2dExporter.js'

// 获取包含 Live2D 数据的 MonoBehaviour
const live2dObject = assetManager.getObjectInfosByClass('MonoBehaviour')[0]
const result = await processLive2DModel(live2dObject, assetManager)

// 返回的 result 结构：
// {
//   name: "character_model",
//   files: {
//     "character_model.moc3": ArrayBuffer,
//     "character_model.model3.json": string/ArrayBuffer,
//     "Textures/texture_00.png": Uint8Array,
//     "Motions/idle.motion3.json": ArrayBuffer,
//     ...
//   }
// }
```

### 2. 导出雪碧图精灵 (Sprite - 自动裁切)

```javascript
const spriteInfo = assetManager.getObjectInfosByClass('Sprite')[0]
// 启用 cutting 参数以自动切除图集周边的空白透明像素
const result = await assetManager.exportSprite(spriteInfo, { cutting: true })
```

### 3. 不同媒体类型的提取与网页端预览演示

这里展示了如何提取常见的文本、图片、音频及 3D 模型资产，并在 Web 浏览器环境下将其转换为可视化/可播放的预览媒介。

#### A. 文本资产 (TextAsset) 提取与预览
```javascript
// 1. 获取并提取 TextAsset 文本
const textAssetInfo = assetManager.getObjectInfosByClass('TextAsset')[0]
const textFile = await assetManager.exportFile(textAssetInfo, { type: 'text' })

// 2. 网页端直接渲染至 DOM 容器
document.getElementById('text-preview-box').textContent = textFile.data.raw
```

#### B. 图片与精灵图 (Texture2D / Sprite) 提取与预览
```javascript
// 1. 获取 Texture2D 资源对象
const textureInfo = assetManager.getObjectInfosByClass('Texture2D')[0]

// 2. 快捷提取并输出 Blob URL（推荐：内部自动完成转码，免去手动 new Blob 与 createObjectURL 步骤）
const textureFile = await assetManager.exportFile(textureInfo, { type: 'blobURL' })

// 3. 赋值给 <img> 标签的 src 属性进行预览
document.getElementById('image-preview-tag').src = textureFile.data.raw  // 此时 raw 是 "blob:http://..."

// 4. 对 Sprite (精灵大图) 进行自动裁切，并同样快捷输出 Blob URL
const spriteInfo = assetManager.getObjectInfosByClass('Sprite')[0]
const spriteFile = await assetManager.exportSprite(spriteInfo, { cutting: true, type: 'blobURL' })
document.getElementById('sprite-preview-tag').src = spriteFile.data.raw
```

#### C. 音频 (AudioClip) 提取与预览
```javascript
// 1. 获取 AudioClip 资源对象
const audioInfo = assetManager.getObjectInfosByClass('AudioClip')[0]

// 2. 快捷提取并输出 Blob URL（推荐：内部自动完成转码，免去手动 new Blob 与 createObjectURL 步骤）
const audioFile = await assetManager.exportFile(audioInfo, { type: 'blobURL' })

// 3. 赋值给 <audio> 标签的 src 属性直接播放进行预览
const audioElement = document.getElementById('audio-preview-tag')
audioElement.src = audioFile.data.raw  // 此时 raw 是 "blob:http://..."
audioElement.play()
```

#### D. 三维模型 (Mesh / SkinnedMeshRenderer) 提取与预览
```javascript
// 1. 导出 3D Mesh 网格（默认导出为标准的 .obj 模型文本）
const meshInfo = assetManager.getObjectInfosByClass('Mesh')[0]
const meshFile = await assetManager.exportFile(meshInfo, { type: 'text' })
console.log('OBJ 模型内容:', meshFile.data.raw)

// 2. 导出带骨骼蒙皮的模型 (SkinnedMeshRenderer) 为 GLB 格式二进制
// 注意：导出 GLB 前必须确保已执行 setDependencies({ THREE, GLTFExporter }) 依赖注入
const skinnedMeshInfo = assetManager.getObjectInfosByClass('SkinnedMeshRenderer')[0]
const glbFile = await assetManager.exportFile(skinnedMeshInfo, { type: 'arrayBuffer' })

// 3. 在网页端使用 Three.js GLTFLoader 载入并预览
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
const loader = new GLTFLoader()
loader.parse(glbFile.data.raw, '', (gltf) => {
    scene.add(gltf.scene) // 添加模型至 WebGL 3D 渲染场景
})
```

---

## 资源修改与重包指南

除了常规的资源反序列化和提取外，`unityfs-js` 还深度支持了对已加载资源的在手修改（Editing），并能够将修改后的对象整体重新打包（Repacking）输出为全新的 `.bundle` 二进制物理文件。在重包时，库会自动重新计算并填充校验码（CRC-32），并按照原包的压缩格式（如 LZ4）执行压缩。

### 1. 修改并保存文本资产 (TextAsset)

对 `TextAsset` 的编辑需要首先确保在加载时启用了类型树（TypeTrees），以便解析器能够重新对结构体进行序列化对齐。

```javascript
import { load } from 'unityfs-js'

// 1. 载入资源包
const assetManager = await load(arrayBuffer)

// 2. 找到特定 TextAsset 资源对象
const textAssetInfo = assetManager.getObjectInfoByName('game_config')
const textAsset = textAssetInfo.object

// 3. 修改文本内容。设置新值时，解析器会自动更新序列化字段并标记该资源为脏数据 (Dirty)
textAsset.text = JSON.stringify({ gameMode: 'Hard', scoreLimit: 99999 })
```

### 2. 修改并保存图片资产 (Texture2D)

本库不仅支持读取各种压缩纹理，还可以通过注入新的 `PNG` 图片字节流来更新 `Texture2D` 资产，并自动将图像转换为未压缩的 `RGBA32` 格式以便重新打包。

```javascript
// 1. 读取准备替换的本地 PNG 图片
const newPngBytes = await fs.promises.readFile('replacement.png')

// 2. 定位 Texture2D 对象
const textureInfo = assetManager.getObjectInfoByName('ui_background')
const texture = textureInfo.object

// 3. 注入 PNG 字节。库会自动解析 PNG 头信息，调整宽度、高度、大图尺寸，并标记该资产为脏数据 (Dirty)
texture.updateImage(newPngBytes)
```

### 3. 修改并保存脚本及配置资产 (MonoBehaviour)

Unity 游戏经常使用挂载了自定义 C# 脚本的 `MonoBehaviour` 节点来存储游戏数值（如人物血量、道具属性、关卡配置和对话文本）。本库提供了非常强大的 `getField` / `setField` 动态属性读写功能。

在编辑 `MonoBehaviour` 前，您必须在 `load` 时确保类型树已启用。

```javascript
// 1. 获取对应的 MonoBehaviour 资产信息
const monoInfo = assetManager.getObjectInfosByClass('MonoBehaviour').find((info) => info.name === 'character_template')
const mono = monoInfo.object

// 2. 查看当前的某些自定义属性 (如 hp 属性)
console.log(mono.getField('hp')) // 100

// 3. 修改自定义属性。写入新值时，库会自动将其映射回 TypeTree，并自动调用 setDirty() 标记资产为脏数据
mono.setField('hp', 99999)
mono.setField('characterName', '无敌勇士')

// 4. 支持快捷开关启用/禁用状态
mono.enabled = false
```

### 4. 将修改后的文件重新打包输出 (Repacking)

在完成对任意资源的修改后，您可以通过调用绑定的 `BundleFile` 的 `serialize()` 方法，将整个资源管理器下的所有文件树（包含未修改的保留文件与已修改的脏文件）重新编码并压缩。

```javascript
// 1. 执行重包序列化，返回重包后的完整二进制数据 (Uint8Array)
const repackedBytes = assetManager.bundleFile.serialize()

// 2. 保存为新的 Unity 资源包文件
await fs.promises.writeFile('game_config_repacked.bundle', repackedBytes)
```

#### 高阶：CAB 内置 CRC-32 校验对齐与欺骗 (CRC Spoofing)

大部分 Unity 在线游戏在热更新或加载 AssetBundle 时，会读取内部 CAB 序列化文件头部的 CRC 校验值以验证包体是否被篡改。
为了解决这一校验问题，`unityfs-js` 在重包时提供了**全自动的 CRC 对齐校验功能**：

- **默认自动对齐（推荐）**：如果您没有手动设置 `targetCrc`，在序列化时，本库会**自动计算并提取加载的原资源包的原始 CAB CRC-32 校验值**作为目标。在重新打包输出时，会自动在数据末尾使用内置的近世代数 CRC 碰撞算法计算并填充 4 字节的碰撞因子，使得修改并重包后的文件 CRC-32 校验值与原包完全一致，从而实现无感知绕过客户端校验。因此，**在绝大多数情况下，您不需要进行任何手动配置即可直接使用**。
- **手动设置（高级自定义）**：如果您需要强制将重包后的 CRC 校验值对齐到特定的自定义校验和，可以在序列化前手动注入十进制的 `targetCrc`：

```javascript
// 手动指定目标的 CAB CRC-32 校验值（如果不设置，本库将默认自动使用原包的 CRC 校验值进行对齐）
assetManager.bundleFile.targetCrc = 3847291032

// 执行序列化重包。重包后的数据将被强制碰撞对齐到该目标 CRC-32
const repackedBytes = assetManager.bundleFile.serialize()
```

---

## 命令行演示运行

在 `example/` 目录中提供了可直接执行的 Node.js ESM 脚本：

```bash
# 进入 example 目录
cd unityfs-js/example

# 导出 Live2D 模型
node exportLive2dDemo.js <资源包路径或文件夹>

# 导出图片与雪碧图
node exportImageDemo.js <资源包路径或文件夹>

# 导出音频
node exportAudioDemo.js <资源包路径或文件夹>

# 导出文本
node exportTextDemo.js <资源包路径或文件夹>

# 导出 3D 网格模型
node exportMeshDemo.js <资源包路径或文件夹>
```

提取出的物理文件将自动存放至 `example/output/` 对应子文件夹中。

## 致谢与开源参考

- [BinomialLLC/crunch](https://github.com/BinomialLLC/crunch) (高性能纹理压缩)
- [Unity-Technologies/crunch](https://github.com/Unity-Technologies/crunch/tree/unity)
- [aelurum/AssetStudio](https://github.com/aelurum/AssetStudio) (C# 资源查看器原型参考)
- [bc7-decoder](https://github.com/Alexander-Holm/bc7-decoder) (BC7 图像解码器)
- [texture2ddecoder-wasm](https://github.com/bjornharrtell/texture2ddecoder-wasm) (多格式 WebAssembly 纹理解码器)
- [ashduino101/WebAssetStudio](https://github.com/ashduino101) (JavaScript 核心解析原型参考)
- [mikalv/python-fsb5](https://github.com/mikalv/python-fsb5) (FSB5 音频提取与重建逻辑参考)
- [Vorbis I Specification](https://xiph.org/vorbis/doc/Vorbis_I_spec.html) (Vorbis 比特流与 Codebook 校验规范)
- [Perfare/UnityLive2DExtractor](https://github.com/Perfare/UnityLive2DExtractor) (Live2D Cubism 3/4 资源提取逻辑原型参考)
- [mos9527/UnityPyLive2DExtractor](https://github.com/mos9527/UnityPyLive2DExtractor) (基于 Python/UnityPy 提取 Live2D 动画与物理配置文件参考)
