import { Renderer } from './renderer.js'
import { PPtr } from './pptr.js'
import { ObjectRegistry } from '../../core/registry.js'

function getThree() {
    const THREE = ObjectRegistry.dependencies.THREE || (typeof window !== 'undefined' ? window.THREE : null)
    if (!THREE) {
        throw new Error('three.js is not configured in UnityJs dependencies.')
    }
    return THREE
}

function getGLTFExporter(THREE) {
    const Exporter =
        ObjectRegistry.dependencies.GLTFExporter ||
        (typeof window !== 'undefined' ? window.GLTFExporter || (THREE ? THREE.GLTFExporter : null) : null)
    if (!Exporter) {
        throw new Error('GLTFExporter is not configured in UnityJs dependencies.')
    }
    return Exporter
}

export class SkinnedMeshRenderer extends Renderer {
    static exposedAttributes = [
        'gameObject',
        'enabled',
        'castShadows',
        'receiveShadows',
        'motionVectors',
        'lightProbeUsage',
        'reflectionProbeUsage',
        'lightmapIndex',
        'lightmapIndexDynamic',
        'lightmapTilingOffset',
        'lightmapTilingOffsetDynamic',
        'materials',
        'staticBatchInfo',
        'staticBatchRoot',
        'probeAnchor',
        'lightProbeVolumeOverride',
        'sortingLayerID',
        'sortingOrder',
        'quality',
        'updateWhenOffscreen',
        'skinNormals',
        'mesh',
        'bones',
        'blendShapeWeights',
    ]

    constructor(reader) {
        super(reader)
        this.quality = reader.readInt32()
        this.updateWhenOffscreen = reader.readBool()
        this.skinNormals = reader.readBool()
        reader.align(4)

        if (reader.version[0] === 2 && reader.version[1] < 6) {
            this.disableAnimationWhenOffscreen = new PPtr(reader)
        }
        this.mesh = new PPtr(reader)

        let numBones = reader.readInt32()
        this.bones = new Array(numBones)
        for (let i = 0; i < numBones; i++) {
            this.bones[i] = new PPtr(reader)
        }
        if (reader.versionGTE(4, 3)) {
            let numWeights = reader.readUInt32()
            this.blendShapeWeights = new Float32Array(numWeights)
            for (let i = 0; i < numWeights; i++) {
                this.blendShapeWeights[i] = reader.readFloat32()
            }
        }
    }

    transformToBone(boneT) {
        const THREE = getThree()
        const bone = new THREE.Bone()
        bone.name = boneT.gameObject.object.name
        bone.position.set(boneT.localPosition.x, boneT.localPosition.y, boneT.localPosition.z)
        bone.rotation.set(boneT.localRotation.x, boneT.localRotation.y, boneT.localRotation.z)
        bone.scale.set(boneT.localScale.x, boneT.localScale.y, boneT.localScale.z)
        return bone
    }

    _mapTransformBone(boneT) {
        const bone = this.transformToBone(boneT)
        boneT.mapChildren()
        for (const b of boneT.children) {
            bone.add(this._mapTransformBone(b.object))
        }
        return bone
    }

    async mapBones() {
        const bones = []
        for (const bone of this.bones) {
            bones.push(this._mapTransformBone(bone.object))
        }
        return bones
    }

    async createSkeleton() {
        const THREE = getThree()
        return new THREE.Skeleton(await this.mapBones())
    }

    _debugBone(bone, level = 0) {
        let str = `${'| '.repeat(level)}${bone.name}\n`
        for (const child of bone.children) {
            str += this._debugBone(child, level + 1)
        }
        return str
    }

    debugSkeleton(skeleton) {
        console.log(this._debugBone(skeleton.bones[0]))
    }

    applyPose(skeleton, pose) {
        const THREE = getThree()
        let i = 0
        skeleton.bones.forEach((bone) => {
            bone.applyMatrix4(new THREE.Matrix4(...pose[i].values))
            i++
        })
    }

    async createMesh() {
        const THREE = getThree()
        let material
        if (this.materials.length > 0) {
            this.materials[0].resolve()
            const mat = this.materials[0].object
            const tex = mat.getTexEnv('_MainTex')
            const emission = mat.getTexEnv('_EmissionMap')
            const bump = mat.getTexEnv('_BumpMap')
            const occlusion = mat.getTexEnv('_OcclusionMap')
            const metallicGloss = mat.getTexEnv('_MetallicGlossMap')

            const bumpScale = mat.getFloat('_BumpScale') ?? 1
            const glossiness = mat.getFloat('_Glossiness') ?? 0
            const metallic = mat.getFloat('_Metallic') ?? 0.7
            const occlusionStrength = mat.getFloat('_OcclusionStrength') ?? 0.75
            const enableEmission = mat.getFloat('_EnableEmission') ?? true

            const loader = new THREE.TextureLoader()

            const matOptions = {
                roughness: 0.75,
                clearcoat: glossiness,
                clearcoatRoughness: 0.5,
                map: tex ? loader.load(await tex.createDataUrl(0)) : null,
            }

            if (emission && enableEmission) {
                matOptions.emissive = 0xffffff
                matOptions.emissiveIntensity = 1
                matOptions.emissiveMap = loader.load(await emission.createDataUrl(0))
            }
            if (bump) {
                matOptions.bumpMap = loader.load(await bump.createDataUrl(0))
                matOptions.bumpScale = bumpScale
            }
            if (occlusion) {
                matOptions.aoMapIntensity = occlusionStrength
                matOptions.aoMap = loader.load(await occlusion.createDataUrl(0))
            }
            if (metallicGloss) {
                matOptions.metalness = metallic
                matOptions.metalnessMap = loader.load(await metallicGloss.createDataUrl(0))
            }

            material = new THREE.MeshPhysicalMaterial(matOptions)
        } else {
            material = new THREE.MeshPhongMaterial({
                color: 0xffffff,
                flatShading: true,
            })
        }

        let mesh = new THREE.Mesh(await this.mesh.object.toGeometry(), material)

        // const skeleton = await this.createSkeleton();
        // console.log(skeleton)
        // this.debugSkeleton(skeleton);
        // mesh.add(skeleton.bones[0]);
        // if (this.mesh.object.bindPose) {
        //   this.applyPose(skeleton, this.mesh.object.bindPose);
        // }
        // mesh.bind(skeleton);

        let max = new THREE.Box3().setFromObject(mesh).max
        let scale = 10 / max.z
        mesh.rotation.set(-1.61443, 0, 0)
        mesh.position.set(0, -4, 0)
        mesh.scale.set(scale, scale, scale)

        return mesh
    }

    async getExport() {
        const THREE = getThree()
        const GLTFExporter = getGLTFExporter(THREE)
        const mesh = await this.createMesh()
        return new Promise((resolve) => {
            setTimeout(() => {
                const exporter = new GLTFExporter()
                exporter.parse(
                    mesh,
                    (gltf) => {
                        resolve(gltf)
                    },
                    (error) => {
                        console.error('Error in GLTF exporter:', error)
                        resolve('Error in GLTF exporter')
                    },
                    { binary: true },
                )
            }, 1000) // wait for textures to load
        })
    }
}
