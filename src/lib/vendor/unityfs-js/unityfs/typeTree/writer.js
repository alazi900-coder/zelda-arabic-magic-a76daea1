import { getRefTypeNode, isNonPrimitiveParsingSupported } from './parser.js'

const utf8Encoder = new TextEncoder()

const defaultValues = {
    bool: false,
    SInt8: 0,
    UInt8: 0,
    short: 0,
    SInt16: 0,
    'unsigned short': 0,
    UInt16: 0,
    SInt32: 0,
    int: 0,
    UInt32: 0,
    'unsigned int': 0,
    'Type*': 0,
    'long long': 0n,
    SInt64: 0n,
    'unsigned long long': 0n,
    UInt64: 0n,
    FileSize: 0n,
    float: 0.0,
    double: 0.0,
    string: '',
    TypelessData: new Uint8Array(0),
    char: '\0\0',
}

const typeWriters = {
    bool: (writer, val) => writer.writeBool(val),
    SInt8: (writer, val) => writer.writeInt8(val),
    UInt8: (writer, val) => writer.writeUInt8(val),
    short: (writer, val) => writer.writeInt16(val),
    SInt16: (writer, val) => writer.writeInt16(val),
    'unsigned short': (writer, val) => writer.writeUInt16(val),
    UInt16: (writer, val) => writer.writeUInt16(val),
    SInt32: (writer, val) => writer.writeInt32(val),
    int: (writer, val) => writer.writeInt32(val),
    UInt32: (writer, val) => writer.writeUInt32(val),
    'unsigned int': (writer, val) => writer.writeUInt32(val),
    'Type*': (writer, val) => writer.writeUInt32(val),
    'long long': (writer, val) => writer.writeInt64(val),
    SInt64: (writer, val) => writer.writeInt64(val),
    'unsigned long long': (writer, val) => writer.writeUInt64(val),
    UInt64: (writer, val) => writer.writeUInt64(val),
    FileSize: (writer, val) => writer.writeUInt64(val),
    float: (writer, val) => writer.writeFloat32(val),
    double: (writer, val) => writer.writeFloat64(val),
    string: (writer, val, size) => {
        const bytes = utf8Encoder.encode(val)
        if (size < 0) {
            writer.writeUInt32(bytes.length)
        }
        writer.write(bytes)
        writer.align(4)
    },
    TypelessData: (writer, val) => {
        writer.writeUInt32(val.length)
        writer.write(val)
    },
    char: (writer, val) => {
        const bytes = utf8Encoder.encode(val)
        writer.write(bytes.subarray(0, 2))
    },
}

export function writeType(type, writer, val, size) {
    const handler = typeWriters[type]
    if (handler) {
        handler(writer, val !== null && typeof val !== 'undefined' ? val : defaultValues[type], size)
    } else {
        throw new Error(`Unknown/unsupported type for writing: ${type}`)
    }
}

export function writeTypeTreeDirect(assetFile, tree, writer, val, config = { has_registry: false }) {
    const align = ((tree.metaFlag ?? 0) & 0x4000) !== 0

    if (tree.children.length === 0 || isNonPrimitiveParsingSupported(tree.type)) {
        writeType(tree.type, writer, val, tree.size)
        if (align) writer.align(4)
        return
    }

    if (tree.children.length === 1 && tree.children[0].type === 'Array') {
        let arrVal = val
        if (val && typeof val === 'object' && !Array.isArray(val) && 'Array' in val) {
            arrVal = val.Array
        }
        writeTypeTreeDirect(assetFile, tree.children[0], writer, arrVal, config)
        if (align) writer.align(4)
        return
    }

    switch (tree.type) {
        case 'pair': {
            const item = val || [undefined, undefined]
            writeTypeTreeDirect(assetFile, tree.children[0], writer, item[0], config)
            writeTypeTreeDirect(assetFile, tree.children[1], writer, item[1], config)
            break
        }

        case 'ReferencedObject': {
            const obj = val || {}
            for (let j = 0; j < tree.children.length; j++) {
                const child = tree.children[j]
                if (child.type === 'ReferencedObjectData') {
                    const refTypeNodes = getRefTypeNode(assetFile, obj.type)
                    if (refTypeNodes) {
                        writeTypeTreeDirect(assetFile, refTypeNodes, writer, obj[child.name], config)
                    }
                } else {
                    writeTypeTreeDirect(assetFile, child, writer, obj[child.name], config)
                }
            }
            break
        }

        case 'Array': {
            const [arraySizeField, arrayTypeField] = tree.children
            const arr = val || []
            writeType(arraySizeField.type, writer, arr.length, arraySizeField.size)

            if (arrayTypeField.type === 'UInt8' || arrayTypeField.type === 'SInt8') {
                writer.write(arr)
            } else {
                for (let i = 0; i < arr.length; i++) {
                    writeTypeTreeDirect(assetFile, arrayTypeField, writer, arr[i], config)
                }
            }
            break
        }

        default: {
            const obj = val || {}
            for (let j = 0; j < tree.children.length; j++) {
                const child = tree.children[j]
                if (child.type === 'ManagedReferencesRegistry') {
                    if (!config.has_registry) {
                        config = { ...config, has_registry: true }
                    } else {
                        continue
                    }
                }
                let childVal = obj[child.name]
                if (typeof childVal === 'undefined') {
                    childVal = obj['_' + child.name]
                }
                if (typeof childVal === 'undefined') {
                    if (child.name === 'first') {
                        childVal = obj['key']
                    } else if (child.name === 'second') {
                        childVal = obj['value']
                    }
                }
                if (typeof childVal === 'undefined' && child.name.startsWith('m_')) {
                    const cleanedName = child.name.substring(2).charAt(0).toLowerCase() + child.name.substring(3)
                    childVal = obj[cleanedName]
                    if (typeof childVal === 'undefined') {
                        childVal = obj['_' + cleanedName]
                    }
                }
                writeTypeTreeDirect(assetFile, child, writer, childVal, config)
            }
            break
        }
    }

    if (align) writer.align(4)
}
