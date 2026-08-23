import { crc32 } from './crc.js'
import { unwrapArray } from './utils.js'

// Unpack StreamedClip helper
export function readStreamedClipFrames(streamedClip) {
    if (!streamedClip || !streamedClip.data) return []
    const rawData = unwrapArray(streamedClip.data)

    const buffer = new ArrayBuffer(rawData.length * 4)
    const dataView = new DataView(buffer)
    for (let i = 0; i < rawData.length; i++) {
        dataView.setUint32(i * 4, rawData[i], true) // true = little-endian write
    }

    const frames = []
    let offset = 0
    const totalBytes = buffer.byteLength

    while (offset < totalBytes) {
        if (offset + 8 > totalBytes) break
        const time = dataView.getFloat32(offset, true)
        const numKeys = dataView.getInt32(offset + 4, true)
        offset += 8

        const keys = []
        for (let k = 0; k < numKeys; k++) {
            if (offset + 20 > totalBytes) break
            const index = dataView.getInt32(offset, true)
            const coeff = [
                dataView.getFloat32(offset + 4, true),
                dataView.getFloat32(offset + 8, true),
                dataView.getFloat32(offset + 12, true),
                dataView.getFloat32(offset + 16, true),
            ]
            const intCoeff = [
                dataView.getInt32(offset + 4, true),
                dataView.getInt32(offset + 8, true),
                dataView.getInt32(offset + 12, true),
                dataView.getInt32(offset + 16, true),
            ]
            offset += 20

            keys.push({
                index,
                time,
                coeff,
                intCoeff,
                inSlope: Infinity,
                get outSlope() {
                    return this.coeff[2]
                },
                get value() {
                    return this.coeff[3]
                },
                get intValue() {
                    return this.intCoeff[3]
                },
                calcNextInSlope(dx, rhs) {
                    if (this.coeff[0] === 0 && this.coeff[1] === 0 && this.coeff[2] === 0) {
                        return Infinity
                    }
                    dx = Math.max(dx, 0.0001)
                    const dy = rhs.value - this.value
                    const length = 1.0 / (dx * dx)
                    const d1 = this.outSlope * dx
                    const d2 = dy + dy + dy - d1 - d1 - this.coeff[1] / length
                    return d2 / dx
                },
            })
        }
        frames.push({ time, keys })
    }

    const preKeys = new Map()
    for (const frame of frames) {
        for (const curveKey of frame.keys) {
            const preKey = preKeys.get(curveKey.index)
            if (preKey) {
                curveKey.inSlope = preKey.calcNextInSlope(frame.time - preKey.time, curveKey)
            }
            preKeys.set(curveKey.index, curveKey)
        }
    }

    return frames
}

// Convert AnimationClip to motion3
export function convertToMotion3(clip, crcMap) {
    const motion = {
        Version: 3,
        Meta: {
            Name: clip.m_Name,
            Duration: clip.m_MuscleClip?.m_StopTime || 0,
            Fps: clip.m_SampleRate || 30,
            Loop: true,
            AreBeziersRestricted: true,
            CurveCount: 0,
            UserDataCount: 0,
            TotalPointCount: 0,
            TotalSegmentCount: 0,
            TotalUserDataSize: 0,
        },
        Curves: [],
        UserData: [],
    }

    const bindingsRaw = clip.m_ClipBindingConstant?.genericBindings || []
    const bindings = unwrapArray(bindingsRaw)
    const sizes = bindings.map((b) => (b.typeID === 4 || b.typeID === 224 ? 3 : 1))
    const sizesPrefix = []
    let acc = 0
    for (const size of sizes) {
        acc += size
        sizesPrefix.push(acc)
    }

    function findBinding(index) {
        let low = 0,
            high = sizesPrefix.length - 1
        while (low < high) {
            const mid = (low + high) >> 1
            if (sizesPrefix[mid] > index) {
                high = mid
            } else {
                low = mid + 1
            }
        }
        return bindings[low]
    }

    const curvesMap = new Map()

    // 1. StreamedClip
    if (clip.m_MuscleClip?.m_Clip?.data?.m_StreamedClip) {
        const streamedFrames = readStreamedClipFrames(clip.m_MuscleClip.m_Clip.data.m_StreamedClip)
        for (const frame of streamedFrames) {
            let keyIndex = 0
            while (keyIndex < frame.keys.length) {
                const startKey = frame.keys[keyIndex]
                const binding = findBinding(startKey.index)
                if (!binding) {
                    keyIndex++
                    continue
                }

                const bSize = binding.typeID === 4 || binding.typeID === 224 ? 3 : 1
                const compKeys = []
                for (let i = 0; i < bSize && keyIndex + i < frame.keys.length; i++) {
                    compKeys.push(frame.keys[keyIndex + i])
                }
                keyIndex += bSize

                const bindingKey = `${binding.path}_${binding.attribute}`
                if (!curvesMap.has(bindingKey)) curvesMap.set(bindingKey, { binding, keys: [] })

                const valKey = compKeys[0]
                curvesMap.get(bindingKey).keys.push({
                    time: frame.time,
                    value: binding.isIntCurve ? valKey.intValue : valKey.value,
                    inSlope: valKey.inSlope,
                    outSlope: valKey.outSlope,
                    isDense: false,
                    isConstant: false,
                })
            }
        }
    }

    // 2. DenseClip
    const denseClip = clip.m_MuscleClip?.m_Clip?.data?.m_DenseClip
    if (denseClip && denseClip.m_FrameCount > 0) {
        const curveOffset = clip.m_MuscleClip.m_Clip.data.m_StreamedClip?.curveCount || 0
        const sampleArray = unwrapArray(denseClip.m_SampleArray)
        for (let frameIndex = 0; frameIndex < denseClip.m_FrameCount; frameIndex++) {
            const time = denseClip.m_BeginTime + frameIndex / denseClip.m_SampleRate
            const frameOffset = frameIndex * denseClip.m_CurveCount
            let curveIndex = 0
            while (curveIndex < denseClip.m_CurveCount) {
                const binding = findBinding(curveOffset + curveIndex)
                if (!binding) {
                    curveIndex++
                    continue
                }
                const bSize = binding.typeID === 4 || binding.typeID === 224 ? 3 : 1
                const sampleValues = []
                for (let i = 0; i < bSize && curveIndex + i < denseClip.m_CurveCount; i++) {
                    sampleValues.push(sampleArray[frameOffset + curveIndex + i])
                }
                curveIndex += bSize

                const bindingKey = `${binding.path}_${binding.attribute}`
                if (!curvesMap.has(bindingKey)) curvesMap.set(bindingKey, { binding, keys: [] })

                curvesMap.get(bindingKey).keys.push({
                    time,
                    value: sampleValues[0],
                    inSlope: 0,
                    outSlope: 0,
                    isDense: true,
                    isConstant: false,
                })
            }
        }
    }

    // 3. ConstantClip
    const constantClip = clip.m_MuscleClip?.m_Clip?.data?.m_ConstantClip
    if (constantClip && constantClip.data) {
        const constData = unwrapArray(constantClip.data)
        if (constData.length > 0) {
            const curveOffset =
                (clip.m_MuscleClip.m_Clip.data.m_StreamedClip?.curveCount || 0) +
                (clip.m_MuscleClip.m_Clip.data.m_DenseClip?.m_CurveCount || 0)
            let curveIndex = 0
            while (curveIndex < constData.length) {
                const binding = findBinding(curveOffset + curveIndex)
                if (!binding) {
                    curveIndex++
                    continue
                }
                const bSize = binding.typeID === 4 || binding.typeID === 224 ? 3 : 1
                const constValues = []
                for (let i = 0; i < bSize && curveIndex + i < constData.length; i++) {
                    constValues.push(constData[curveIndex + i])
                }
                curveIndex += bSize

                const bindingKey = `${binding.path}_${binding.attribute}`
                if (!curvesMap.has(bindingKey)) curvesMap.set(bindingKey, { binding, keys: [] })

                const times = [0, clip.m_MuscleClip.m_StopTime || 1.0]
                for (const time of times) {
                    curvesMap.get(bindingKey).keys.push({
                        time,
                        value: constValues[0],
                        inSlope: 0,
                        outSlope: 0,
                        isDense: false,
                        isConstant: true,
                    })
                }
            }
        }
    }

    for (const [bindingKey, curveData] of curvesMap.entries()) {
        const binding = curveData.binding
        const keys = curveData.keys.sort((a, b) => a.time - b.time)
        if (keys.length === 0) continue

        let target = 'PartOpacity'
        let id = String(binding.path)

        const pathStr = crcMap.get(Number(binding.path))
        if (pathStr) {
            const parts = pathStr.split('/')
            if (parts[0] === 'Parameters') {
                target = 'Parameter'
            } else if (parts[0] === 'Parts') {
                target = 'PartOpacity'
            }
            id = parts[1]
        }

        const segments = [0, keys[0].value]
        for (let i = 1; i < keys.length; i++) {
            const lhs = keys[i - 1]
            const rhs = keys[i]

            let ipo = 1
            if (lhs.isDense) {
                ipo = 2
            } else if (lhs.isConstant) {
                ipo = 4
            } else {
                if (lhs.outSlope === Infinity || rhs.inSlope === Infinity) {
                    ipo = 3
                } else {
                    ipo = 1
                }
            }

            if (ipo === 4 || ipo === 3) {
                segments.push(2)
                segments.push(rhs.time)
                segments.push(rhs.value)
                motion.Meta.TotalPointCount += 1
            } else if (ipo === 1) {
                const dx = (rhs.time - lhs.time) / 3
                segments.push(1)
                segments.push(lhs.time + dx)
                segments.push(lhs.outSlope * dx + lhs.value)
                segments.push(rhs.time - dx)
                segments.push(rhs.value - rhs.inSlope * dx)
                segments.push(rhs.time)
                segments.push(rhs.value)
                motion.Meta.TotalPointCount += 3
            } else {
                segments.push(0)
                segments.push(rhs.time)
                segments.push(rhs.value)
                motion.Meta.TotalPointCount += 1
            }
            motion.Meta.TotalSegmentCount += 1
        }

        motion.Curves.push({
            Target: target,
            Id: id,
            Segments: segments,
        })
    }

    motion.Meta.CurveCount = motion.Curves.length

    const eventsRaw = clip.m_Events || []
    const events = unwrapArray(eventsRaw)
    for (const ev of events) {
        motion.UserData.push({
            time: ev.time,
            value: ev.data,
        })
        motion.Meta.UserDataCount += 1
        motion.Meta.TotalUserDataSize += String(ev.data).length
    }

    return motion
}

// Traverse GameObject components and children recursively to build CRC32 Map
export async function buildCrcMap(gameObject, manager, crcMap) {
    if (!gameObject) return

    const name = gameObject.name || gameObject.m_Name
    if (name === 'Parameters' || name === 'Parts') {
        const components = gameObject.components || gameObject.m_Components || []
        let transformComponent = null
        for (const compPtr of components) {
            const pathID = compPtr.pathID || compPtr.m_PathID || compPtr.value?.m_PathID
            if (!pathID) continue
            const compObjInfo = manager.getObjectInfoByPathId(BigInt(pathID))
            if (compObjInfo && (compObjInfo.classID === 4 || compObjInfo.classID === 224)) {
                transformComponent = compObjInfo.object
                break
            }
        }
        if (transformComponent) {
            const children = transformComponent.children || transformComponent.m_Children || []
            for (const childPtr of children) {
                const childPathID = childPtr.pathID || childPtr.m_PathID || childPtr.value?.m_PathID
                if (!childPathID) continue
                const childTransformObj = manager.getObjectInfoByPathId(BigInt(childPathID))
                const childTransform = childTransformObj?.object
                if (childTransform && childTransform.gameObject) {
                    const childGameObjPathID =
                        childTransform.gameObject.pathID ||
                        childTransform.gameObject.m_PathID ||
                        childTransform.gameObject.value?.m_PathID
                    if (childGameObjPathID) {
                        const childGameObj = manager.getObjectInfoByPathId(BigInt(childGameObjPathID))?.object
                        if (childGameObj) {
                            const childName = childGameObj.name || childGameObj.m_Name
                            const pathStr = `${name}/${childName}`
                            crcMap.set(crc32(pathStr), pathStr)
                        }
                    }
                }
            }
        }
    }

    // Traverse children
    const components = gameObject.components || gameObject.m_Components || []
    let transformComponent = null
    for (const compPtr of components) {
        const pathID = compPtr.pathID || compPtr.m_PathID || compPtr.value?.m_PathID
        if (!pathID) continue
        const compObjInfo = manager.getObjectInfoByPathId(BigInt(pathID))
        if (compObjInfo && (compObjInfo.classID === 4 || compObjInfo.classID === 224)) {
            transformComponent = compObjInfo.object
            break
        }
    }
    if (transformComponent) {
        const children = transformComponent.children || transformComponent.m_Children || []
        for (const childPtr of children) {
            const childPathID = childPtr.pathID || childPtr.m_PathID || childPtr.value?.m_PathID
            if (!childPathID) continue
            const childTransformObj = manager.getObjectInfoByPathId(BigInt(childPathID))
            const childTransform = childTransformObj?.object
            if (childTransform && childTransform.gameObject) {
                const childGameObjPathID =
                    childTransform.gameObject.pathID ||
                    childTransform.gameObject.m_PathID ||
                    childTransform.gameObject.value?.m_PathID
                if (childGameObjPathID) {
                    const childGameObj = manager.getObjectInfoByPathId(BigInt(childGameObjPathID))?.object
                    if (childGameObj) {
                        await buildCrcMap(childGameObj, manager, crcMap)
                    }
                }
            }
        }
    }
}
