export class ObjectRegistry {
    static parsers = new Map()
    static names = new Map()
    static exporters = new Map()
    static dependencies = {
        THREE: null,
        GLTFExporter: null,
    }

    /**
     * Register a class parser
     * @param {number} classId
     * @param {string} className
     * @param {Function} parserClass
     * @param {Function} [exporterFn=null] Optional exporter handler
     */
    static register(classId, className, parserClass, exporterFn = null) {
        this.parsers.set(classId, parserClass)
        this.names.set(classId, className)
        if (exporterFn) {
            this.exporters.set(className, exporterFn)
        }
    }

    /**
     * Register a fallback class name when no parser is available
     * @param {number} classId
     * @param {string} className
     */
    static registerFallbackName(classId, className) {
        if (!this.names.has(classId)) {
            this.names.set(classId, className)
        }
    }

    /**
     * Get parser class for a class ID
     * @param {number} classId
     * @returns {Function|null}
     */
    static getParser(classId) {
        return this.parsers.get(classId) || null
    }

    /**
     * Get class name for a class ID
     * @param {number} classId
     * @returns {string}
     */
    static getClassName(classId) {
        return this.names.get(classId) || `Class_${classId}`
    }

    /**
     * Get registered exporter function for a class name
     * @param {string} className
     * @returns {Function|null}
     */
    static getExporter(className) {
        return this.exporters.get(className) || null
    }

    /**
     * Get all registered class names
     * @returns {string[]}
     */
    static getAllClassNames() {
        return Array.from(this.names.values())
    }
}
