import { NamedObject } from './namedObject.js'
// import hljs from 'highlight.js';
// import csharp from 'highlight.js/lib/languages/csharp.js';
// import 'highlight.js/styles/idea.css';
//import {CSharpDecompiler} from "../../cs-decomp/decompiler.js";

export class MonoScript extends NamedObject {
    static exposedAttributes = ['name', 'executionOrder', 'propertiesHash', 'className', 'namespace', 'assemblyName']

    constructor(reader) {
        super(reader)
        if (reader.versionGTE(3, 4)) {
            this.executionOrder = reader.readInt32()
        }
        if (reader.version[0] < 5) {
            this.propertiesHash = reader.readUInt32()
        } else {
            this.propertiesHash = reader.readGUID()
        }
        if (reader.version[0] < 3) {
            this.pathName = reader.readAlignedString()
        }
        this.className = reader.readAlignedString()
        if (reader.version[0] >= 3) {
            this.namespace = reader.readAlignedString()
        }
        this.assemblyName = reader.readAlignedString()
        if (reader.versionLT(2018, 2)) {
            this.isEditorScript = reader.readBool()
        }
        this.assemblyData = null
    }

    getFullPath() {
        if (this.pathName) return this.pathName
        let path = ''
        if (this.namespace !== '') {
            path += this.namespace + '.'
        }
        if (this.className !== '') {
            path += this.className
        }
        return path
    }
}
