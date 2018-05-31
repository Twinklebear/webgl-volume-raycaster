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
	var vt = vec3.set(vec3.create(), 0.0, 0.0, amount * this.zoomSpeed);
	var t = mat4.fromTranslation(mat4.create(), vt);
	this.translation = mat4.mul(this.translation, t, this.translation);
	if (this.translation[14] >= -0.4) {
		this.translation[14] = -0.4;
	}
	this.updateCameraMatrix();
}

ArcballCamera.prototype.updateCameraMatrix = function() {
	// camera = translation * rotation * centerTranslation
	var rotMat = mat4.fromQuat(mat4.create(), this.rotation);
	this.camera = mat4.mul(this.camera, rotMat, this.centerTranslation);
	this.camera = mat4.mul(this.camera, this.translation, this.camera);
	this.invCamera = mat4.invert(this.invCamera, this.camera);
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

