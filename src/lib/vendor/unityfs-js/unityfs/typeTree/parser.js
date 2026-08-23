const utf16leDecoder = new TextDecoder('utf-16le')

const typeHandlers = {
    bool: (reader) => reader.readBool(),
    SInt8: (reader) => reader.readInt8(),
    UInt8: (reader) => reader.readUInt8(),
    short: (reader) => reader.readInt16(),
    SInt16: (reader) => reader.readInt16(),
    'unsigned short': (reader) => reader.readUInt16(),
    UInt16: (reader) => reader.readUInt16(),
    SInt32: (reader) => reader.readInt32(),
    int: (reader) => reader.readInt32(),
    UInt32: (reader) => reader.readUInt32(),
    'unsigned int': (reader) => reader.readUInt32(),
    'Type*': (reader) => reader.readUInt32(),
    'long long': (reader) => reader.readInt64(),
    SInt64: (reader) => reader.readInt64(),
    'unsigned long long': (reader) => reader.readUInt64(),
    UInt64: (reader) => reader.readUInt64(),
    FileSize: (reader) => reader.readUInt64(),
    float: (reader) => reader.readFloat32(),
    double: (reader) => reader.readFloat64(),
    string: (reader, size) => {
        const actualSize = size < 0 ? reader.readUInt32() : size
        const text = reader.readCodeString(actualSize, 'utf-8')
        reader.align(4)
        return text
    },
    TypelessData: (reader) => {
        const dataSize = reader.readUInt32()
        return reader.read(dataSize)
    },
    char: (reader) => utf16leDecoder.decode(reader.read(2)),
}

const ALIGNMENT_TYPES = new Set([
    'SInt8',
    'UInt8',
    'char',
    'short',
    'SInt16',
    'unsigned short',
    'UInt16',
    'int',
    'SInt32',
    'unsigned int',
    'UInt32',
    'Type*',
    'long long',
    'SInt64',
    'unsigned long long',
    'UInt64',
    'FileSize',
    'float',
    'double',
    'bool',
    'string',
    'map',
    'TypelessData',
    'Array',
])

export function readType(type, reader, size) {
    const handler = typeHandlers[type]
    if (handler) {
        return handler(reader, size)
    }

    throw new Error(`Unknown/unsupported type: ${type}`)
}

export function isNonPrimitiveParsingSupported(type) {
    return type === 'string' || type === 'TypelessData'
}

export function shouldCheckTypeAlignment(type) {
    return ALIGNMENT_TYPES.has(type)
}

export function getRefTypeNode(assetFile, refObject) {
    if (!refObject) return null
    const values = Object.values(refObject)
    const cls = values[0]
    const ns = values[1]
    const asm = values[2]

    if (!assetFile.refTypes) {
        throw new Error('SerializedFile has no ref_types')
    }

    if (!cls) {
        return null
    }

    for (const refType of assetFile.refTypes) {
        if (cls === refType.className && ns === refType.nameSpace && asm === refType.assemblyName) {
            return refType.tree
        }
    }

    throw new Error(`Referenced type not found: ${cls} ${ns} ${asm}`)
}

export function parseTypeTreeDirect(assetFile, tree, reader, config, checkBigInt) {
    const align = ((tree.metaFlag ?? 0) & 0x4000) !== 0

    if (tree.children.length === 0 || isNonPrimitiveParsingSupported(tree.type)) {
        const val = readType(tree.type, reader, tree.size)
        if (align) reader.align(4)
        return checkBigInt(val)
    }

    if (tree.children.length === 1 && tree.children[0].type === 'Array') {
        const arr = parseTypeTreeDirect(assetFile, tree.children[0], reader, config, checkBigInt)
        if (align) reader.align(4)
        return arr
    }

    let result
    switch (tree.type) {
        case 'pair':
            result = [
                parseTypeTreeDirect(assetFile, tree.children[0], reader, config, checkBigInt),
                parseTypeTreeDirect(assetFile, tree.children[1], reader, config, checkBigInt),
            ]
            break

        case 'ReferencedObject':
            result = {}
            for (let j = 0; j < tree.children.length; j++) {
                const child = tree.children[j]
                if (child.type === 'ReferencedObjectData') {
                    const refTypeNodes = getRefTypeNode(assetFile, result.type)
                    if (refTypeNodes) {
                        result[child.name] = parseTypeTreeDirect(assetFile, refTypeNodes, reader, config, checkBigInt)
                    }
                } else {
                    result[child.name] = parseTypeTreeDirect(assetFile, child, reader, config, checkBigInt)
                }
            }
            break

        case 'Array': {
            const [arraySizeField, arrayTypeField] = tree.children
            const arrayLength = readType(arraySizeField.type, reader, arraySizeField.size)

            if (arrayLength >= 10_000_000) {
                console.warn('Unusually large array detected', {
                    length: arrayLength,
                    position: reader.tell(),
                })
            }

            if (arrayTypeField.type === 'UInt8' || arrayTypeField.type === 'SInt8') {
                result = reader.read(arrayLength)
            } else {
                result = new Array(arrayLength)
                for (let i = 0; i < arrayLength; i++) {
                    result[i] = parseTypeTreeDirect(assetFile, arrayTypeField, reader, config, checkBigInt)
                }
            }
            break
        }

        default:
            result = {}
            for (let j = 0; j < tree.children.length; j++) {
                const child = tree.children[j]
                if (child.type === 'ManagedReferencesRegistry') {
                    if (!config.has_registry) {
                        config = { ...config, has_registry: true }
                    } else {
                        continue
                    }
                }

                result[child.name] = parseTypeTreeDirect(assetFile, child, reader, config, checkBigInt)
            }
            break
    }

    if (align) reader.align(4)
    return result
}

export function getObjectUsingTreeJSON(assetFile, obj) {
    const typeRef = assetFile.getClass(obj.classID)
    if (!typeRef) {
        throw new Error('匹配的typeRef为空')
    }

    let type = assetFile.types[obj.typeID].tree

    if (!assetFile.enableTypeTrees) {
        assetFile.reader.seek(obj.offset)
        return assetFile.reader.read(obj.size)
    }

    const SAFE_MIN = BigInt(Number.MIN_SAFE_INTEGER)
    const SAFE_MAX = BigInt(Number.MAX_SAFE_INTEGER)

    const checkBigInt = (value) => {
        if (typeof value !== 'bigint') return value
        return value < SAFE_MIN || value > SAFE_MAX ? value.toString() : Number(value)
    }

    assetFile.reader.seek(obj.offset)
    return parseTypeTreeDirect(assetFile, type, assetFile.reader, { has_registry: false }, checkBigInt)
}
