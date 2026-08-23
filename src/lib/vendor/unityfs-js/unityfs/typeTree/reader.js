import { SharedStrings } from '../sharedStrings.js'
import { BinaryReader, decodeUTF8, SEEK_CUR } from '../../core/binaryStream.js'
import { TypeTree } from './model.js'

const sharedStringCache = new Map()

export function getStringFromTable(table, offset = 0) {
    let end = offset
    const len = table.length
    while (end < len && table[end] !== 0) {
        end++
    }
    return decodeUTF8(table.subarray(offset, end))
}

export function getString(localTable, offset) {
    const isLocalOffset = (offset & 0x80000000) === 0
    if (isLocalOffset) {
        return getStringFromTable(localTable, offset)
    } else {
        const cleanOffset = offset & 0x7fffffff
        let cached = sharedStringCache.get(cleanOffset)
        if (cached === undefined) {
            cached = getStringFromTable(SharedStrings, cleanOffset)
            sharedStringCache.set(cleanOffset, cached)
        }
        return cached
    }
}

export function readLegacy(typeTree, reader, type, level = 0) {
    typeTree.level = level
    typeTree.type = reader.readCString()
    typeTree.name = reader.readCString()
    typeTree.size = reader.readInt32()
    if (typeTree.version === 2) {
        reader.readInt32()
    }
    if (typeTree.version !== 3) {
        typeTree.index = reader.readInt32()
    }
    typeTree.typeFlags = reader.readInt32()
    typeTree.version = reader.readInt32()
    if (typeTree.version !== 3) {
        typeTree.metaFlag = reader.readInt32()
    }
    let childCount = reader.readInt32()
    for (let i = 0; i < childCount; i++) {
        let child = new TypeTree(typeTree.version, undefined)
        readLegacy(child, reader, type, level + 1)
        typeTree.children.push(child)
    }
    return typeTree
}

export function readBlob(typeTree, reader) {
    let t = typeTree
    reader.offset = typeTree.startOffset
    const numNodes = reader.readInt32()
    const stringTableSize = reader.readInt32()
    let nodeReader = new BinaryReader(reader.read((typeTree.version >= 19 ? 32 : 24) * numNodes))
    nodeReader.endian = reader.endian
    let stringTable = reader.read(stringTableSize)

    typeTree.level = -1
    let stack = [typeTree]
    let parent = typeTree
    let prev = typeTree

    for (let i = 0; i < numNodes; i++) {
        let curr = new TypeTree(typeTree.version, undefined)
        curr.version = nodeReader.readUInt16()
        curr.level = nodeReader.data[nodeReader.offset++]
        curr.typeFlags = nodeReader.data[nodeReader.offset++]
        curr.type = getString(stringTable, nodeReader.readInt32())
        curr.name = getString(stringTable, nodeReader.readInt32())
        curr.size = nodeReader.readInt32()
        curr.index = nodeReader.readInt32()
        curr.metaFlag = nodeReader.readInt32()

        if (typeTree.version >= 19) {
            curr.refHash = nodeReader.readUInt64()
        }

        if (curr.level > prev.level) {
            stack.push(parent)
            parent = prev
        } else {
            if (curr.level < prev.level) {
                while (curr.level <= parent.level) {
                    parent = stack.pop()
                }
            }
        }
        parent.children.push(curr)
        prev = curr
    }
    let end = typeTree.children[0]
    Object.keys(end).forEach((key) => {
        t[key] = end[key]
    })
    typeTree.reader = undefined
}

export function skipBlob(typeTree, reader) {
    typeTree.start = reader.offset
    const numNodes = reader.readUInt32()
    const stringTableSize = reader.readUInt32()
    reader.seek((typeTree.version >= 19 ? 32 : 24) * numNodes + stringTableSize, SEEK_CUR)
}

export function getTreeFromReference(typeTreeRef) {
    if (typeof typeTreeRef._cachedTree !== 'undefined') {
        return typeTreeRef._cachedTree
    }
    let _offset = typeTreeRef.reader.offset
    typeTreeRef.reader.seek(typeTreeRef.offset)

    if (typeTreeRef.enableTypeTrees) {
        let tree = new TypeTree(typeTreeRef.version, typeTreeRef.reader)
        if (typeTreeRef.version >= 12 || typeTreeRef.version === 10) {
            readBlob(tree, typeTreeRef.reader)
        } else {
            readLegacy(tree, typeTreeRef.reader)
        }
        typeTreeRef.reader.seek(_offset)
        typeTreeRef._cachedTree = tree
        return tree
    }
    typeTreeRef._cachedTree = '(not present)'
    return '(not present)'
}
