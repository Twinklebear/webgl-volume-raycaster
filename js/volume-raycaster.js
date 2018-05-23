var cubeStrip = [
	1, 1, 0,
	0, 1, 0,
	1, 1, 1,
	0, 1, 1,
	0, 0, 1,
	0, 1, 0,
	0, 0, 0,
	1, 1, 0,
	1, 0, 0,
	1, 1, 1,
	1, 0, 1,
	0, 0, 1,
	1, 0, 0,
	0, 0, 0
];

var vertShader =
"#version 300 es\n" +
"layout(location=0) in vec3 pos;" +
"uniform mat4 proj_view;" +
"uniform highp vec3 eye_pos;" +
"out vec3 vray_dir;" +
"void main(void) {" +
	"vray_dir = pos - eye_pos;" +
	"gl_Position = proj_view * vec4(pos, 1);" +
"}";

var fragShader =
"#version 300 es\n" +
"uniform highp sampler3D volume;" +
"uniform highp sampler2D palette;" +
"uniform highp vec3 eye_pos;" +
"in highp vec3 vray_dir;" +
"out highp vec4 color;" +

"highp vec2 intersectBox(highp vec3 orig, highp vec3 dir) {" +
	"const highp vec3 box_min = vec3(0);" +
	"const highp vec3 box_max = vec3(1);" +
	"highp vec3 inv_dir = 1.0 / dir;" +
	"highp vec3 tmin_tmp = (box_min - orig) * inv_dir;" +
	"highp vec3 tmax_tmp = (box_max - orig) * inv_dir;" +
	"highp vec3 tmin = min(tmin_tmp, tmax_tmp);" +
	"highp vec3 tmax = max(tmin_tmp, tmax_tmp);" +
	"highp float t0 = max(tmin.x, max(tmin.y, tmin.z));" +
	"highp float t1 = min(tmax.x, min(tmax.y, tmax.z));" +
	"return vec2(t0, t1);" +
"}" +

"void main(void) {" +
	//"color = texture(palette, gl_FragCoord.xy / vec2(640, 480));" +
	"highp vec3 transformed_eye = eye_pos;" +
	"highp vec3 ray_dir = normalize(vray_dir);" +
	"highp vec2 t_hit = intersectBox(transformed_eye, ray_dir);" +
	"color = vec4(0);" +
	"if (t_hit.x > t_hit.y) {" +
		"discard;" +
	"}" +
	"highp int n_samples = 128;" +
	"highp float dt = (t_hit.y - t_hit.x) / float(n_samples);" +
	// TODO: for later when we decided step size based on volume dims
	//for (highp float t = t_hit.x; t < t_hit.y; t += dt)
	"highp vec3 p = transformed_eye + t_hit.x * ray_dir;" +
	"for (highp int i = 0; i < n_samples; ++i) {" +
		"highp float val = texture(volume, p).r;" +
		"highp vec4 val_color = vec4(texture(palette, vec2(val, 0.5)).rgb, val);"+
		"color.rgb += (1.0 - color.a) * val_color.a * val_color.rgb;" +
		"color.a += (1.0 - color.a) * val_color.a;" +
		"if (color.a >= 0.95) {" +
			"break;" +
		"}" +
		"p += ray_dir * dt;" +
	"}" +
"}";

var gl = null;

window.onload = function(){
	var canvas = document.getElementById("glcanvas");
	gl = canvas.getContext("webgl2");
	if (!gl) {
		alert("Unable to initialize WebGL2. Your browser may not support it")
		return;
	}
	var WIDTH = canvas.getAttribute("width");
	var HEIGHT = canvas.getAttribute("height");

	var vao = gl.createVertexArray();
	gl.bindVertexArray(vao);

	var vbo = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cubeStrip), gl.STATIC_DRAW);

	gl.enableVertexAttribArray(0);
	gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

	var volumeTexture = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_3D, volumeTexture);
	// TODO: Is non-pow2 or non-even supported?
	var vol_dims = [64, 64, 64];
	gl.texStorage3D(gl.TEXTURE_3D, 1, gl.R8, vol_dims[0], vol_dims[1], vol_dims[2]);
	gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

	gl.activeTexture(gl.TEXTURE1);
	var palette = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, palette);
	gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, 180, 14);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	var paletteImage = new Image();
	paletteImage.onload = function() {
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, palette);
		gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 180, 14,
			gl.RGBA, gl.UNSIGNED_BYTE, paletteImage);

		console.log("Created palette, now requesting volume");

		//var url = "http://cdn.klacansky.com/open-scivis-datasets/nucleon/nucleon_41x41x41_uint8.raw";
		//var url = "http://sci.utah.edu/~will/nucleon_41x41x41_uint8.raw";
		//var url = "file://C:/Users/Will/repos/webgl-volume-raycasting/nucleon_41x41x41_uint8.raw";
		var url = "file://C:/Users/Will/repos/webgl-volume-raycaster/fuel_64x64x64_uint8.raw";
		//var url = "file://C:/Users/Will/repos/webgl-volume-raycaster/neghip_64x64x64_uint8.raw";
		var req = new XMLHttpRequest();
		req.open("GET", url, true);
		req.responseType = "arraybuffer";
		req.onload = function(evt) {
			console.log("got volume");
			var dataBuffer = req.response;
			if (dataBuffer) {
				dataBuffer = new Uint8Array(dataBuffer);
				console.log("Got " + dataBuffer.byteLength + " bytes");
			} else {
				console.log("no buffer?");
			}

			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_3D, volumeTexture);
			gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, 0,
				vol_dims[0], vol_dims[1], vol_dims[2],
				gl.RED, gl.UNSIGNED_BYTE, dataBuffer);

			var shader = compileShader(vertShader, fragShader);
			gl.useProgram(shader);

			var eyePosLoc = gl.getUniformLocation(shader, "eye_pos");
			var projViewLoc = gl.getUniformLocation(shader, "proj_view");

			var eye = vec3.set(vec3.create(), 0.8, 0.8, 1.3);
			var center = vec3.set(vec3.create(), 0.5, 0.5, 0.5);
			var up = vec3.set(vec3.create(), 0, 1, 0);
			gl.uniform3fv(eyePosLoc, eye);

			var proj = mat4.perspective(mat4.create(), 60 * Math.PI / 180.0,
				WIDTH / HEIGHT, 0.1, 100);
			var view = mat4.lookAt(mat4.create(), eye, center, up);
			var proj_view = mat4.mul(mat4.create(), proj, view);
			gl.uniformMatrix4fv(projViewLoc, false, proj_view);
			gl.uniform1i(gl.getUniformLocation(shader, "volume"), 0);
			gl.uniform1i(gl.getUniformLocation(shader, "palette"), 1);

			gl.disable(gl.DEPTH_TEST);
			gl.enable(gl.CULL_FACE);
			gl.cullFace(gl.FRONT);
			gl.enable(gl.BLEND);
			gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

			gl.clearColor(0.0, 0.0, 0.0, 0.0);
			gl.clear(gl.COLOR_BUFFER_BIT);

			gl.drawArrays(gl.TRIANGLE_STRIP, 0, cubeStrip.length / 3);
			// TODO render every 16ms in a loop
		};
		req.send(null);
	};
	paletteImage.src = "cool-warm-paraview.png";
}

// Compile and link the shaders vert and frag. vert and frag should contain
// the shader source code for the vertex and fragment shaders respectively
// Returns the compiled and linked program, or null if compilation or linking failed
function compileShader(vert, frag){
	var vs = gl.createShader(gl.VERTEX_SHADER);
	gl.shaderSource(vs, vert);
	gl.compileShader(vs);
	if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)){
		alert("Vertex shader failed to compile, see console for log");
		console.log(gl.getShaderInfoLog(vs));
		return null;
	}

	var fs = gl.createShader(gl.FRAGMENT_SHADER);
	gl.shaderSource(fs, frag);
	gl.compileShader(fs);
	if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)){
		alert("Fragment shader failed to compile, see console for log");
		console.log(gl.getShaderInfoLog(fs));
		return null;
	}

	var program = gl.createProgram();
	gl.attachShader(program, vs);
	gl.attachShader(program, fs);
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)){
		alert("Shader failed to link, see console for log");
		console.log(gl.getProgramInfoLog(program));
		return null;
	}
	return program;
}


