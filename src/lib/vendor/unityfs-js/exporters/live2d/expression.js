// Helper: Map expression parameters to Live2D specification
export function convertExpression(expData) {
    const type = expData.Type || expData._type || 'Live2D Expression'
    const fadeInTime =
        expData.FadeInTime !== undefined
            ? expData.FadeInTime
            : expData._fadeInTime !== undefined
              ? expData._fadeInTime
              : 1.0
    const fadeOutTime =
        expData.FadeOutTime !== undefined
            ? expData.FadeOutTime
            : expData._fadeOutTime !== undefined
              ? expData._fadeOutTime
              : 1.0

    const rawParams = expData.Parameters || expData._parameters || []
    const len = rawParams.length
    const parameters = new Array(len)
    for (let i = 0; i < len; i++) {
        const p = rawParams[i]
        const id = p.Id || p._id || p.id || ''
        const value = p.Value !== undefined ? p.Value : p._value !== undefined ? p._value : 0.0
        const blendVal = p.Blend !== undefined ? p.Blend : p._blend !== undefined ? p._blend : 2

        let blendStr = 'Overwrite'
        if (blendVal === 0 || blendVal === 'Add' || blendVal === 'add') {
            blendStr = 'Add'
        } else if (blendVal === 1 || blendVal === 'Multiply' || blendVal === 'multiply') {
            blendStr = 'Multiply'
        }

        parameters[i] = {
            Id: id,
            Value: value,
            Blend: blendStr,
        }
    }

    return {
        Type: type,
        FadeInTime: fadeInTime,
        FadeOutTime: fadeOutTime,
        Parameters: parameters,
    }
}
