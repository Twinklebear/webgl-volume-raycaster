var vertShader =
`#version 300 es
#line 4
layout(location=0) in vec3 pos;
uniform mat4 proj_view;
uniform highp vec3 eye_pos;
uniform highp vec3 volume_scale;
out vec3 vray_dir;
flat out highp vec3 transformed_eye;
void main(void) {
	highp vec3 volume_translation = vec3(0.5) - volume_scale * 0.5;
	transformed_eye = (eye_pos - volume_translation) / volume_scale;
	// TODO: For non-uniform size volumes we need to transform them differently as well
	// to center them properly
	vray_dir = pos - transformed_eye;
	gl_Position = proj_view * vec4(pos * volume_scale + volume_translation, 1);
}`;

var fragShader =
`#version 300 es
#line 22
uniform highp sampler3D volume;
uniform highp sampler2D colormap;
uniform highp ivec3 volume_dims;
uniform highp vec3 eye_pos;
uniform highp float dt_scale;
in highp vec3 vray_dir;
flat in highp vec3 transformed_eye;
out highp vec4 color;

highp vec2 intersectBox(highp vec3 orig, highp vec3 dir) {
	const highp vec3 box_min = vec3(0);
	const highp vec3 box_max = vec3(1);
	highp vec3 inv_dir = 1.0 / dir;
	highp vec3 tmin_tmp = (box_min - orig) * inv_dir;
	highp vec3 tmax_tmp = (box_max - orig) * inv_dir;
	highp vec3 tmin = min(tmin_tmp, tmax_tmp);
	highp vec3 tmax = max(tmin_tmp, tmax_tmp);
	highp float t0 = max(tmin.x, max(tmin.y, tmin.z));
	highp float t1 = min(tmax.x, min(tmax.y, tmax.z));
	return vec2(t0, t1);
}

// Pseudo-random number gen from
// http://www.reedbeta.com/blog/quick-and-easy-gpu-random-numbers-in-d3d11/
// with some tweaks for the range of values
highp float wang_hash(highp int seed) {
	seed = (seed ^ 61) ^ (seed >> 16);
	seed *= 9;
	seed = seed ^ (seed >> 4);
	seed *= 0x27d4eb2d;
	seed = seed ^ (seed >> 15);
	return float(seed % 2147483647) / float(2147483647);
}

void main(void) {
	highp vec3 ray_dir = normalize(vray_dir);
	highp vec2 t_hit = intersectBox(transformed_eye, ray_dir);
	if (t_hit.x > t_hit.y) {
		discard;
	}
	t_hit.x = max(t_hit.x, 0.0);
	highp vec3 dt_vec = 1.0 / (vec3(volume_dims) * abs(ray_dir));
	highp float dt = dt_scale * min(dt_vec.x, min(dt_vec.y, dt_vec.z));
	highp float offset = wang_hash(int(gl_FragCoord.x + 640.0 * gl_FragCoord.y));
	highp vec3 p = transformed_eye + (t_hit.x + offset * dt) * ray_dir;
	for (highp float t = t_hit.x; t < t_hit.y; t += dt) {
		highp float val = texture(volume, p).r;
		highp vec4 val_color = vec4(texture(colormap, vec2(val, 0.5)).rgb, val);
		color.rgb += (1.0 - color.a) * val_color.a * val_color.rgb;
		color.a += (1.0 - color.a) * val_color.a;
		if (color.a >= 0.95) {
			break;
		}
		p += ray_dir * dt;
	}
}`;

