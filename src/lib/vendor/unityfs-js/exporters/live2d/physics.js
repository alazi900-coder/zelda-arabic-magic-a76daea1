// Helper: Map physics parameters to Live2D specification
export function exportPhysicsSettings(data) {
    const settings = data._physicsRig?._settings || []
    const settingsLen = settings.length
    const physicsSettings = new Array(settingsLen)

    for (let sIdx = 0; sIdx < settingsLen; sIdx++) {
        const s = settings[sIdx]

        // 1. Inputs
        const inputs = s._inputs || []
        const inputsLen = inputs.length
        const mappedInputs = new Array(inputsLen)
        for (let i = 0; i < inputsLen; i++) {
            const iVal = inputs[i]
            mappedInputs[i] = {
                Source: {
                    Target: iVal._source?._target || 'Parameter',
                    Id: iVal._source?._id || '',
                },
                Weight: iVal._weight || 0,
                Type: iVal._type || 'X',
                Reflect: iVal._reflect || false,
            }
        }

        // 2. Outputs
        const outputs = s._outputs || []
        const outputsLen = outputs.length
        const mappedOutputs = new Array(outputsLen)
        for (let o = 0; o < outputsLen; o++) {
            const oVal = outputs[o]
            mappedOutputs[o] = {
                Destination: {
                    Target: oVal._destination?._target || 'Parameter',
                    Id: oVal._destination?._id || '',
                },
                ValueAffecting: oVal._valueAffecting || 'Additive',
                Scale: oVal._scale || 1.0,
                Weight: oVal._weight || 1.0,
                Type: oVal._type || 'X',
                Reflect: oVal._reflect || false,
            }
        }

        // 3. Vertices
        const particles = s._particles || []
        const particlesLen = particles.length
        const mappedParticles = new Array(particlesLen)
        for (let p = 0; p < particlesLen; p++) {
            const pVal = particles[p]
            mappedParticles[p] = {
                Position: pVal._position || { X: 0, Y: 0 },
                Mobility: pVal._mobility || 1.0,
                Delay: pVal._delay || 1.0,
                Acceleration: pVal._acceleration || 1.0,
                Radius: pVal._radius || 0.0,
            }
        }

        physicsSettings[sIdx] = {
            Id: s._id || '',
            Input: mappedInputs,
            Output: mappedOutputs,
            Vertices: mappedParticles,
            Normalization: {
                Position: {
                    Minimum: s._normalization?._position?._minimum || -10,
                    Default: s._normalization?._position?._default || 0,
                    Maximum: s._normalization?._position?._maximum || 10,
                },
                Angle: {
                    Minimum: s._normalization?._angle?._minimum || -10,
                    Default: s._normalization?._angle?._default || 0,
                    Maximum: s._normalization?._angle?._maximum || 10,
                },
            },
        }
    }

    return {
        Version: 3,
        Meta: {
            EvaluationTime: data._physicsRig?._evaluationTime || 0,
            Fps: data._physicsRig?._fps || 60,
            EffectiveForces: {
                Gravity: data._physicsRig?._gravity || { X: 0, Y: -1 },
                Wind: data._physicsRig?._wind || { X: 0, Y: 0 },
            },
            PhysicsSettingCount: data._physicsRig?._settings?.length || 0,
        },
        PhysicsSettings: physicsSettings,
    }
}
