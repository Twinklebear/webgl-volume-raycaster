var ArcballCamera = function(center, zoomSpeed, screenDims) {
	this.zoomSpeed = zoomSpeed;
	this.invScreen = [1.0 / screenDims[0], 1.0 / screenDims[1]];

	this.centerTranslation = mat4.fromTranslation(mat4.create(), center);
	mat4.invert(this.centerTranslation, this.centerTranslation);
	var vt = vec3.set(vec3.create(), 0, 0, -1.0);
	this.translation = mat4.fromTranslation(mat4.create(), vt);
	this.rotation = quat.create();

	this.camera = mat4.create();
	this.invCamera = mat4.create();
	this.updateCameraMatrix();
}

ArcballCamera.prototype.rotate = function(prevMouse, curMouse) {
	var mPrev = vec2.set(vec2.create(),
		clamp(prevMouse[0] * 2.0 * this.invScreen[0] - 1.0, -1.0, 1.0),
		clamp(1.0 - prevMouse[1] * 2.0 * this.invScreen[1], -1.0, 1.0));

	var mCur = vec2.set(vec2.create(),
		clamp(curMouse[0] * 2.0 * this.invScreen[0] - 1.0, -1.0, 1.0),
		clamp(1.0 - curMouse[1] * 2.0 * this.invScreen[1], -1.0, 1.0));

	var mPrevBall = screenToArcball(mPrev);
	var mCurBall = screenToArcball(mCur);
	// rotation = curBall * prevBall * rotation
	this.rotation = quat.mul(this.rotation, mPrevBall, this.rotation);
	this.rotation = quat.mul(this.rotation, mCurBall, this.rotation);

	this.updateCameraMatrix();
}

ArcballCamera.prototype.zoom = function(amount) {
	var vt = vec3.set(vec3.create(), 0.0, 0.0, amount * this.invScreen[1] * this.zoomSpeed);
	var t = mat4.fromTranslation(mat4.create(), vt);
	this.translation = mat4.mul(this.translation, t, this.translation);
	if (this.translation[14] >= -0.2) {
		this.translation[14] = -0.2;
	}
	this.updateCameraMatrix();
}

ArcballCamera.prototype.pan = function(mouseDelta) {
	var delta = vec4.set(vec4.create(), mouseDelta[0] * this.invScreen[0] * Math.abs(this.translation[14]),
		mouseDelta[1] * this.invScreen[1] * Math.abs(this.translation[14]), 0, 0);
	var worldDelta = vec4.transformMat4(vec4.create(), delta, this.invCamera);
	var translation = mat4.fromTranslation(mat4.create(), worldDelta);
	this.centerTranslation = mat4.mul(this.centerTranslation, translation, this.centerTranslation);
	this.updateCameraMatrix();
}

ArcballCamera.prototype.updateCameraMatrix = function() {
	// camera = translation * rotation * centerTranslation
	var rotMat = mat4.fromQuat(mat4.create(), this.rotation);
	this.camera = mat4.mul(this.camera, rotMat, this.centerTranslation);
	this.camera = mat4.mul(this.camera, this.translation, this.camera);
	this.invCamera = mat4.invert(this.invCamera, this.camera);
}

ArcballCamera.prototype.eyePos = function() {
	return [camera.invCamera[12], camera.invCamera[13], camera.invCamera[14]];
}

ArcballCamera.prototype.eyeDir = function() {
	var dir = vec4.set(vec4.create(), 0.0, 0.0, -1.0, 0.0);
	dir = vec4.transformMat4(dir, dir, this.invCamera);
	dir = vec4.normalize(dir, dir);
	return [dir[0], dir[1], dir[2]];
}

ArcballCamera.prototype.upDir = function() {
	var dir = vec4.set(vec4.create(), 0.0, 1.0, 0.0, 0.0);
	dir = vec4.transformMat4(dir, dir, this.invCamera);
	dir = vec4.normalize(dir, dir);
	return [dir[0], dir[1], dir[2]];
}

var screenToArcball = function(p) {
	var dist = vec2.dot(p, p);
	if (dist <= 1.0) {
		return quat.set(quat.create(), p[0], p[1], Math.sqrt(1.0 - dist), 0);
	} else {
		var unitP = vec2.normalize(vec2.create(), p);
		// cgmath is w, x, y, z
		// glmatrix is x, y, z, w
		return quat.set(quat.create(), unitP[0], unitP[1], 0, 0);
	}
}
var clamp = function(a, min, max) {
	return a < min ? min : a > max ? max : a;
}

var pointDist = function(a, b) {
	var v = [b[0] - a[0], b[1] - a[1]];
	return Math.sqrt(Math.pow(v[0], 2.0) + Math.pow(v[1], 2.0));
}

/* The controller can register callbacks for various events on a canvas:
 *
 * mousemove: function(prevMouse, curMouse, evt)
 *     receives both regular mouse events, and single-finger drags (sent as a left-click),
 *
 * wheel: function(amount)
 *     mouse wheel scrolling
 *
 * pinch: function(amount)
 *     two finger pinch, receives the distance change between the fingers
 *
 * twoFingerDrag: function(dragVector)
 *     two finger drag, receives the drag movement amount
 */
var Controller = function() {
	this.mousemove = null;
	this.wheel = null;
	this.twoFingerDrag = null;
	this.pinch = null;
}

Controller.prototype.registerForCanvas = function(canvas) {
	var prevMouse = null;
	var mouseState = [false, false];
	var self = this;
	canvas.addEventListener("mousemove", function(evt) {
		evt.preventDefault();
		var rect = canvas.getBoundingClientRect();
		var curMouse = [evt.clientX - rect.left, evt.clientY - rect.top];
		if (!prevMouse) {
			prevMouse = [evt.clientX - rect.left, evt.clientY - rect.top];
		} else if (self.mousemove) {
			self.mousemove(prevMouse, curMouse, evt);
		}
		prevMouse = curMouse;
	});

	canvas.addEventListener("wheel", function(evt) {
		evt.preventDefault();
		if (self.wheel) {
			self.wheel(-evt.deltaY);
		}
	});

	canvas.oncontextmenu = function (evt) {
		evt.preventDefault();
	};

	var touches = {};
	canvas.addEventListener("touchstart", function(evt) {
		var rect = canvas.getBoundingClientRect();
		evt.preventDefault();
		for (var i = 0; i < evt.changedTouches.length; ++i) {
			var t = evt.changedTouches[i];
			touches[t.identifier] = [t.clientX - rect.left, t.clientY - rect.top];
		}
	});

	canvas.addEventListener("touchmove", function(evt) {
		evt.preventDefault();
		var rect = canvas.getBoundingClientRect();
		var numTouches = Object.keys(touches).length;
		// Single finger to rotate the camera
		if (numTouches == 1) {
			if (self.mousemove) {
				var t = evt.changedTouches[0];
				var prevTouch = touches[t.identifier];
				var curTouch = [t.clientX - rect.left, t.clientY - rect.top];
				evt.buttons = 1;
				self.mousemove(prevTouch, curTouch, evt);
			}
		} else {
			var curTouches = {};
			for (var i = 0; i < evt.changedTouches.length; ++i) {
				var t = evt.changedTouches[i];
				curTouches[t.identifier] = [t.clientX - rect.left, t.clientY - rect.top];
			}

			// If some touches didn't change make sure we have them in
			// our curTouches list to compute the pinch distance
			// Also get the old touch points to compute the distance here
			var oldTouches = [];
			for (t in touches) {
				if (!(t in curTouches)) {
					curTouches[t] = touches[t];
				}
				oldTouches.push(touches[t]);
			}

			var newTouches = [];
			for (t in curTouches) {
				newTouches.push(curTouches[t]);
			}

			// Determine if the user is pinching or panning
			var motionVectors = [
				vec2.set(vec2.create(), newTouches[0][0] - oldTouches[0][0],
					newTouches[0][1] - oldTouches[0][1]),
				vec2.set(vec2.create(), newTouches[1][0] - oldTouches[1][0],
					newTouches[1][1] - oldTouches[1][1])
			];
			var motionDirs = [vec2.create(), vec2.create()];
			vec2.normalize(motionDirs[0], motionVectors[0]);
			vec2.normalize(motionDirs[1], motionVectors[1]);
			
			var pinchAxis = vec2.set(vec2.create(), oldTouches[1][0] - oldTouches[0][0],
				oldTouches[1][1] - oldTouches[0][1]);
			vec2.normalize(pinchAxis, pinchAxis);

			var panAxis = vec2.lerp(vec2.create(), motionVectors[0], motionVectors[1], 0.5);
			vec2.normalize(panAxis, panAxis);

			var pinchMotion = [
				vec2.dot(pinchAxis, motionDirs[0]),
				vec2.dot(pinchAxis, motionDirs[1])
			];
			var panMotion = [
				vec2.dot(panAxis, motionDirs[0]),
				vec2.dot(panAxis, motionDirs[1])
			];

			// If we're primarily moving along the pinching axis and in the opposite direction with
			// the fingers, then the user is zooming.
			// Otherwise, if the fingers are moving along the same direction they're panning
			if (self.pinch && Math.abs(pinchMotion[0]) > 0.5 && Math.abs(pinchMotion[1]) > 0.5
				&& Math.sign(pinchMotion[0]) != Math.sign(pinchMotion[1]))
			{
				// Pinch distance change for zooming
				var oldDist = pointDist(oldTouches[0], oldTouches[1]);
				var newDist = pointDist(newTouches[0], newTouches[1]);
				self.pinch(newDist - oldDist);
			} else if (self.twoFingerDrag && Math.abs(panMotion[0]) > 0.5 && Math.abs(panMotion[1]) > 0.5
				&& Math.sign(panMotion[0]) == Math.sign(panMotion[1]))
			{
				// Pan by the average motion of the two fingers
				var panAmount = vec2.lerp(vec2.create(), motionVectors[0], motionVectors[1], 0.5);
				panAmount[1] = -panAmount[1];
				self.twoFingerDrag(panAmount);
			}
		}

		// Update the existing list of touches with the current positions
		for (var i = 0; i < evt.changedTouches.length; ++i) {
			var t = evt.changedTouches[i];
			touches[t.identifier] = [t.clientX - rect.left, t.clientY - rect.top];
		}
	});

	var touchEnd = function(evt) {
		evt.preventDefault();
		for (var i = 0; i < evt.changedTouches.length; ++i) {
			var t = evt.changedTouches[i];
			delete touches[t.identifier];
		}
	}
	canvas.addEventListener("touchcancel", touchEnd);
	canvas.addEventListener("touchend", touchEnd);
}

var Shader = function(vertexSrc, fragmentSrc) {
	var self = this;
	this.program = compileShader(vertexSrc, fragmentSrc);

	var regexUniform = /uniform[^;]+[ ](\w+);/g
	var matchUniformName = /uniform[^;]+[ ](\w+);/

	this.uniforms = {};

	var vertexUnifs = vertexSrc.match(regexUniform);
	var fragUnifs = fragmentSrc.match(regexUniform);

	if (vertexUnifs) {
		vertexUnifs.forEach(function(unif) {
			var m = unif.match(matchUniformName);
			self.uniforms[m[1]] = -1;
		});
	}
	if (fragUnifs) {
		fragUnifs.forEach(function(unif) {
			var m = unif.match(matchUniformName);
			self.uniforms[m[1]] = -1;
		});
	}

	for (unif in this.uniforms) {
		this.uniforms[unif] = gl.getUniformLocation(this.program, unif);
	}
}

Shader.prototype.use = function() {
	gl.useProgram(this.program);
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

var getGLExtension = function(ext) {
	if (!gl.getExtension(ext)) {
		alert("Missing " + ext + " WebGL extension");
		return false;
	}
	return true;
}

