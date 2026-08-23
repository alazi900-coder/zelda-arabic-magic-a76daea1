const R = 0,
    G = 1,
    B = 2,
    A = 3

export default function rotateRGBA(rgba, rotation) {
    // 0 – Block format is Scalar(A) Vector(RGB) - no swapping
    // 1 – Block format is Scalar(R) Vector(AGB) - swap A and R
    // 2 – Block format is Scalar(G) Vector(RAB) - swap A and G
    // 3 - Block format is Scalar(B) Vector(RGA) - swap A and B
    switch (rotation) {
        case 0:
            break
        case 1:
            swapColorAlpha(rgba, R)
            break
        case 2:
            swapColorAlpha(rgba, G)
            break
        case 3:
            swapColorAlpha(rgba, B)
            break
    }
}

function swapColorAlpha(rgba, color) {
    const temp = rgba[color]
    rgba[color] = rgba[A]
    rgba[A] = temp
}
