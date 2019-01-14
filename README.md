# WebGL Volume Raycaster

A scientific visualization style volume raycaster written
using WebGL2 and Javascript. The renderer uses an arcball camera which supports
mouse or touch input, and dynamically adjusts the sampling rate
to maintain a smooth framerate, even on mobile devices. The volumes
are downloaded via XMLHttpRequest from Dropbox when selected.
[Try it out online!](https://www.willusher.io/webgl-volume-raycaster/)
I've also written a [blog post](https://www.willusher.io/webgl/2019/01/13/volume-rendering-with-webgl)
about how this renderer is implemented.

Uses [webgl-util](https://github.com/Twinklebear/webgl-util) for some WebGL utilities and [glMatrix](http://glmatrix.net/) for matrix/vector operations.

## Images

![volume renderings](https://i.imgur.com/YqdyKCj.png)

