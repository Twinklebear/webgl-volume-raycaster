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
"uniform highp sampler2D colormap;" +
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

// Pseudo-random number gen from
// http://www.reedbeta.com/blog/quick-and-easy-gpu-random-numbers-in-d3d11/
// with some tweaks for the range of values
"highp float wang_hash(highp int seed) {" +
	"seed = (seed ^ 61) ^ (seed >> 16);" +
	"seed *= 9;" +
	"seed = seed ^ (seed >> 4);" +
	"seed *= 0x27d4eb2d;" +
	"seed = seed ^ (seed >> 15);" +
	"return float(seed % 2147483647) / float(2147483647);" +
"}" +

"void main(void) {" +
	//"color = texture(colormap, gl_FragCoord.xy / vec2(640, 480));" +
	"highp vec3 ray_dir = normalize(vray_dir);" +
	"highp vec2 t_hit = intersectBox(eye_pos, ray_dir);" +
	"color = vec4(0);" +
	"if (t_hit.x > t_hit.y) {" +
		"discard;" +
	"}" +
	"highp int n_samples = 64;" +
	"highp float dt = (t_hit.y - t_hit.x) / float(n_samples);" +
	"highp float offset = wang_hash(int(gl_FragCoord.x + 640.0 * gl_FragCoord.y));" +
	// TODO: for later when we decided step size based on volume dims
	//for (highp float t = t_hit.x; t < t_hit.y; t += dt)
	"highp vec3 p = eye_pos + (t_hit.x + offset * dt) * ray_dir;" +
	"for (highp int i = 0; i < n_samples; ++i) {" +
		"highp float val = texture(volume, p).r;" +
		"highp vec4 val_color = vec4(texture(colormap, vec2(val, 0.5)).rgb, val);"+
		"color.rgb += (1.0 - color.a) * val_color.a * val_color.rgb;" +
		"color.a += (1.0 - color.a) * val_color.a;" +
		"if (color.a >= 0.95) {" +
			"break;" +
		"}" +
		"p += ray_dir * dt;" +
	"}" +
"}";

var gl = null;
var volumeTexture = null;
var colormapTex = null;
var fileRegex = /.*\/(\w+)_(\d+)x(\d+)x(\d+)_(\w+)\.*/;
var proj = null;
var camera = null;
var projView = null;
var projViewLoc = null;

var volumes = {
	"Fuel": "7d87jcsh0qodk78/fuel_64x64x64_uint8.raw",
	"Bonsai": "rdnhdxmxtfxe0sa/bonsai_256x256x256_uint8.raw",
	"Foot": "ic0mik3qv4vqacm/foot_256x256x256_uint8.raw",
	"Skull": "5rfjobn0lvb7tmo/skull_256x256x256_uint8.raw",
	"Hydrogen Atom": "jwbav8s3wmmxd5x/hydrogen_atom_128x128x128_uint8.raw",
	"Neghip": "zgocya7h33nltu9/neghip_64x64x64_uint8.raw",
};

var colormaps = {
	"Cool Warm": "colormaps/cool-warm-paraview.png",
	"Matplotlib Plasma": "colormaps/matplotlib-plasma.png",
	"Matplotlib Virdis": "colormaps/matplotlib-virdis.png",
	"Rainbow": "colormaps/rainbow.png",
	"Samsel Linear Grean": "colormaps/samsel-linear-green.png",
	"Samsel Linear YGB 1211G": "colormaps/samsel-linear-ygb-1211g.png",
};

var loadVolume = function(file, onload) {
	console.log("loading " + file);
	var m = file.match(fileRegex);
	var vol_dims = [parseInt(m[2]), parseInt(m[3]), parseInt(m[4])];
	
	var url = "https://www.dl.dropboxusercontent.com/s/" + file + "?dl=1";
	var req = new XMLHttpRequest();
	var loadingProgressText = document.getElementById("loadingText");

	req.open("GET", url, true);
	req.responseType = "arraybuffer";
	req.onprogress = function(evt) {
		var vol_size = vol_dims[0] * vol_dims[1] * vol_dims[2];
		var percent = evt.loaded / vol_size * 100;
		loadingProgressText.innerHTML = "Loading: " + percent.toFixed(2) + "%";
	};
	req.onerror = function(evt) {
		loadingProgressText.innerHTML = "Error Loading Volume";
	};
	req.onload = function(evt) {
		loadingProgressText.innerHTML = "Loading Done";
		var dataBuffer = req.response;
		if (dataBuffer) {
			dataBuffer = new Uint8Array(dataBuffer);
			console.log("Got " + dataBuffer.byteLength + " bytes");
			onload(file, dataBuffer);
		} else {
			console.log("no buffer?");
		}
	};
	req.send();
}

var selectVolume = function() {
	var selection = document.getElementById("volumeList").value;

	loadVolume(volumes[selection], function(file, dataBuffer) {
		var m = file.match(fileRegex);
		var vol_dims = [parseInt(m[2]), parseInt(m[3]), parseInt(m[4])];

		var tex = gl.createTexture();
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_3D, tex);
		gl.texStorage3D(gl.TEXTURE_3D, 1, gl.R8, vol_dims[0], vol_dims[1], vol_dims[2]);
		gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, 0,
			vol_dims[0], vol_dims[1], vol_dims[2],
			gl.RED, gl.UNSIGNED_BYTE, dataBuffer);

		if (!volumeTexture) {
			setInterval(function() {
				gl.clearColor(0.0, 0.0, 0.0, 0.0);
				gl.clear(gl.COLOR_BUFFER_BIT);

				projView = mat4.mul(projView, proj, camera.camera);
				gl.uniformMatrix4fv(projViewLoc, false, projView);

				var eye = [camera.invCamera[12], camera.invCamera[13], camera.invCamera[14]];
				gl.uniform3fv(eyePosLoc, eye);

				gl.drawArrays(gl.TRIANGLE_STRIP, 0, cubeStrip.length / 3);
			}, 32);
		} else {
			gl.deleteTexture(volumeTexture);
			volumeTexture = tex;
		}
	});
}

var selectColormap = function() {
	var selection = document.getElementById("colormapList").value;
	var colormapImage = new Image();
	colormapImage.onload = function() {
		gl.activeTexture(gl.TEXTURE1);
		gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 180, 1,
			gl.RGBA, gl.UNSIGNED_BYTE, colormapImage);
	};
	colormapImage.src = colormaps[selection];
}

window.onload = function(){
	fillVolumeSelector();
	fillcolormapSelector();

	var canvas = document.getElementById("glcanvas");
	gl = canvas.getContext("webgl2");
	if (!gl) {
		alert("Unable to initialize WebGL2. Your browser may not support it")
		return;
	}
	var WIDTH = canvas.getAttribute("width");
	var HEIGHT = canvas.getAttribute("height");

	proj = mat4.perspective(mat4.create(), 60 * Math.PI / 180.0,
		WIDTH / HEIGHT, 0.1, 100);

	var center = vec3.set(vec3.create(), 0.5, 0.5, 0.5);
	camera = new ArcballCamera(center, 0.01, [WIDTH, HEIGHT]);

	// Register mouse and touch listeners
	var prevMouse = null;
	var mouseState = [false, false];
	canvas.addEventListener("mousemove", function(evt) {
		var curMouse = [evt.clientX, evt.clientY];
		if (!prevMouse) {
			prevMouse = [evt.clientX, evt.clientY];
		} else {
			if (evt.buttons == 1) {
				camera.rotate(prevMouse, curMouse);
			}
		}
		prevMouse = curMouse;
	});
	canvas.addEventListener("mousewheel", function(evt) {
	});

	// Setup VAO and VBO to render the cube to run the raymarching shader
	var vao = gl.createVertexArray();
	gl.bindVertexArray(vao);

	var vbo = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cubeStrip), gl.STATIC_DRAW);

	gl.enableVertexAttribArray(0);
	gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

	var shader = compileShader(vertShader, fragShader);
	gl.useProgram(shader);

	eyePosLoc = gl.getUniformLocation(shader, "eye_pos");
	projViewLoc = gl.getUniformLocation(shader, "proj_view");
	projView = mat4.create();

	gl.uniform1i(gl.getUniformLocation(shader, "volume"), 0);
	gl.uniform1i(gl.getUniformLocation(shader, "colormap"), 1);

	// Setup required OpenGL state for drawing the back faces and
	// composting with the background color
	gl.disable(gl.DEPTH_TEST);
	gl.enable(gl.CULL_FACE);
	gl.cullFace(gl.FRONT);
	gl.enable(gl.BLEND);
	gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

	// Load the default colormap and upload it, after which we
	// load the default volume.
	var colormapImage = new Image();
	colormapImage.onload = function() {
		var colormap = gl.createTexture();
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, colormap);
		gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, 180, 1);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 180, 1,
			gl.RGBA, gl.UNSIGNED_BYTE, colormapImage);

		selectVolume();
	};
	colormapImage.src = "colormaps/cool-warm-paraview.png";
}

var fillVolumeSelector = function() {
	var selector = document.getElementById("volumeList");
	for (v in volumes) {
		var opt = document.createElement("option");
		opt.value = v;
		opt.innerHTML = v;
		selector.appendChild(opt);
	}
}

var fillcolormapSelector = function() {
	var selector = document.getElementById("colormapList");
	for (p in colormaps) {
		var opt = document.createElement("option");
		opt.value = p;
		opt.innerHTML = p;
		selector.appendChild(opt);
	}
}

// Compile and link the shaders vert and frag. vert and frag should contain
// the shader source code for the vertex and fragment shaders respectively
// Returns the compiled and linked program, or null if compilation or linking failed
var compileShader = function(vert, frag){
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

