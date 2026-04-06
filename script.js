// === Colour constants ===
const YELLOW = "rgb(255, 203, 76)";
const BROWN = "rgb(101, 71, 27)";
const ORANGE = "rgb(241, 144, 32)";

// === Slider parameters ===
const MOODS = ["neutral", "smile", "frown", "smile 2", "frown 2"];

const params = {
    face_spikiness: null,
    face_point_count: null,
    eye_size: null,
    eye_spikiness: null,
    eye_point_count: null,
    mood: null,
    mouth_width: null,
    mouth_height: null,
    mouth_angle: null,
    unibrow_threshold: null,
    eyebrow_type_l: null,
    eyebrow_type_r: null,
    eyebrow_arc_l: null,
    eyebrow_arc_r: null,
    eyebrow_width_l: null,
    eyebrow_width_r: null,
    eyebrow_height_l: null,
    eyebrow_height_r: null,
    eyebrow_thickness_l: null,
    eyebrow_thickness_r: null,
    eyebrow_rotation_l: null,
    eyebrow_rotation_r: null,
    finger_length: null,
    hand_angle: null,
    hand_size: null,
};

// === Seeded RNG helpers ===
let rng;
let unibrowed = false;

function uniform(a, b) {
    return rng() * (b - a) + a;
}

function randint(a, b) {
    return Math.floor(rng() * (b - a + 1)) + a;
}

function choice(arr) {
    return arr[Math.floor(rng() * arr.length)];
}

// === Geometry helpers ===

function rotate_point(x, y, cx, cy, angle_rad) {
    const cos_a = Math.cos(angle_rad);
    const sin_a = Math.sin(angle_rad);
    const dx = x - cx, dy = y - cy;
    return [cx + dx * cos_a - dy * sin_a,
        cy + dx * sin_a + dy * cos_a];
}

function bezier_quadratic(t, p0, p1, p2) {
    const x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t ** 2 * p2[0];
    const y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t ** 2 * p2[1];
    return [x, y];
}

function point_in_polygon(x, y, polygon) {
    let inside = false;
    let [px, py] = polygon[polygon.length - 1];
    for (const [cx, cy] of polygon) {
        if ((cy > y) !== (py > y) &&
            x < (px - cx) * (y - cy) / (py - cy + 1e-10) + cx) {
            inside = !inside;
        }
        [px, py] = [cx, cy];
    }
    return inside;
}

function bounding_box(points) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of points) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
    }
    return [minX, minY, maxX, maxY];
}

function bounding_boxes_collide(box1, box2) {
    const [x1_min, y1_min, x1_max, y1_max] = box1;
    const [x2_min, y2_min, x2_max, y2_max] = box2;
    return !(x1_max < x2_min || x1_min > x2_max ||
        y1_max < y2_min || y1_min > y2_max);
}

function polygons_overlap(poly1, poly2) {
    for (const [x, y] of poly1) {
        if (point_in_polygon(x, y, poly2)) return true;
    }
    for (const [x, y] of poly2) {
        if (point_in_polygon(x, y, poly1)) return true;
    }
    return false;
}

function closest_midpoint(poly1, poly2) {
    let min_dist = Infinity;
    let closest_pair = [null, null];
    for (const p1 of poly1) {
        for (const p2 of poly2) {
            const dist = Math.hypot(p1[0] - p2[0], p1[1] - p2[1]);
            if (dist < min_dist) {
                min_dist = dist;
                closest_pair = [p1, p2];
            }
        }
    }
    const [[x1, y1], [x2, y2]] = closest_pair;
    return [(x1 + x2) / 2, (y1 + y2) / 2];
}

function random_point_in_polygon(polygon, inside = true) {
    const min_x = Math.min(...polygon.map(p => p[0]));
    const max_x = Math.max(...polygon.map(p => p[0]));
    const min_y = Math.min(...polygon.map(p => p[1]));
    const max_y = Math.max(...polygon.map(p => p[1]));

    for (let attempt = 0; attempt < 100; attempt++) {
        const x = uniform(min_x, max_x);
        const y = uniform(min_y, max_y);
        if (inside === point_in_polygon(x, y, polygon)) {
            return [x, y];
        }
    }
    return null;
}

function is_polygon_inside_blob(polygon, blob) {
    return polygon.every(([x, y]) => point_in_polygon(x, y, blob));
}

function chaikin_smooth(points, iterations = 2) {
    let pts = points;
    for (let iter = 0; iter < iterations; iter++) {
        const new_pts = [];
        for (let i = 0; i < pts.length; i++) {
            const p0 = pts[i];
            const p1 = pts[(i + 1) % pts.length];
            new_pts.push([0.75 * p0[0] + 0.25 * p1[0], 0.75 * p0[1] + 0.25 * p1[1]]);
            new_pts.push([0.25 * p0[0] + 0.75 * p1[0], 0.25 * p0[1] + 0.75 * p1[1]]);
        }
        pts = new_pts;
    }
    return pts;
}

function transform_points(points, angle_deg = 0, current_origin = [0, 0], new_origin = [0, 0], zoom = 1.0) {
    const angle_rad = angle_deg * Math.PI / 180;
    const cos_a = Math.cos(angle_rad);
    const sin_a = Math.sin(angle_rad);
    const [cx, cy] = current_origin;
    const [nx, ny] = new_origin;
    const dx = nx - cx, dy = ny - cy;

    return points.map(([x, y]) => {
        const sx = x + dx, sy = y + dy;
        const tx = (sx - nx) * zoom, ty = (sy - ny) * zoom;
        return [tx * cos_a - ty * sin_a + nx,
            tx * sin_a + ty * cos_a + ny];
    });
}

function should_use_unibrow(bbox1, bbox2) {
    const max_diff = params.unibrow_threshold !== null ? params.unibrow_threshold : 75;
    return Math.abs(bbox1[1] - bbox2[1]) < max_diff;
}

// === Generation functions ===

function generate_blob(center, radius) {
    const spikiness = params.face_spikiness !== null ? params.face_spikiness : uniform(0, 1);
    const point_count = params.face_point_count !== null ? params.face_point_count : randint(6, 18);
    const [cx, cy] = center;
    const angle_step = 2 * Math.PI / point_count;

    const points = [];
    for (let i = 0; i < point_count; i++) {
        const angle = i * angle_step;
        const r = radius * (1 + uniform(-spikiness, spikiness));
        points.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
    }
    return points;
}

function generate_eyes(face_polygon, inside = true) {
    const eye_radius = params.eye_size !== null ? params.eye_size : randint(20, 50);
    const eyes = [];
    for (let i = 0; i < 2; i++) {
        const center = random_point_in_polygon(face_polygon, inside);
        if (center === null) continue;
        eyes.push(generate_eye(center, eye_radius));
    }
    return eyes;
}

function generate_eye(center, radius) {
    const spikiness = params.eye_spikiness !== null ? params.eye_spikiness : uniform(0, 0.5);
    const point_count = params.eye_point_count !== null ? params.eye_point_count : randint(4, 8);
    const [cx, cy] = center;
    const angle_step = 2 * Math.PI / point_count;

    const points = [];
    for (let i = 0; i < point_count; i++) {
        const angle = i * angle_step;
        const r = radius * (1 + uniform(-spikiness, spikiness));
        points.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
    }
    return points;
}

function generate_eyebrow(eye_bbox, side = "l") {
    const [x0, y0, x1, y1] = eye_bbox;
    const eye_width = x1 - x0;
    const eye_height = y1 - y0;
    const cx = (x0 + x1) / 2;

    const pw = params["eyebrow_width_" + side];
    const pr = params["eyebrow_rotation_" + side];
    const ph = params["eyebrow_height_" + side];
    const pt = params["eyebrow_thickness_" + side];
    const ptype = params["eyebrow_type_" + side];
    const parc = params["eyebrow_arc_" + side];

    const width_mult = pw !== null ? pw : uniform(1.0, 2.2);
    const rotation = pr !== null ? pr * Math.PI / 180 : uniform(-Math.PI / 6, Math.PI / 6);
    const thickness = pt !== null ? pt : uniform(0.2, 0.5);
    const height_off = ph !== null ? ph : uniform(0, 1);
    const use_arc = ptype !== null ? ptype === 1 : Math.random() < 0.35;

    const width = eye_width * width_mult;
    const height = eye_height * thickness;
    const cy = y0 - eye_height * height_off;

    if (use_arc) {
        const arc_amount = parc !== null ? parc * (width / 2) : uniform(-0.8, 0.8) * (width / 2);
        const cy_draw = cy - Math.max(0, -arc_amount);
        const steps = 12;
        const outer = [], inner = [];
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = cx - width / 2 + width * t;
            const curve = 4 * arc_amount * t * (1 - t);
            outer.push([x, cy_draw - curve]);
            inner.push([x, cy_draw - curve + height]);
        }
        const pts = outer.concat(inner.slice().reverse());
        return pts.map(([x, y]) => rotate_point(x, y, cx, cy_draw, rotation));
    } else {
        const tilt = uniform(-0.3, 0.3) * height;
        const left = cx - width / 2, right = cx + width / 2;
        const pts = [
            [left, cy],
            [right, cy],
            [right, cy + height + tilt],
            [left, cy + height - tilt],
        ];
        return pts.map(([x, y]) => rotate_point(x, y, cx, cy + height / 2, rotation));
    }
}

function generate_unibrow(bbox1, bbox2) {
    const x0 = Math.min(bbox1[0], bbox2[0]);
    const x1 = Math.max(bbox1[2], bbox2[2]);
    const y1 = Math.min(bbox1[1], bbox2[1]);
    const cx = (x0 + x1) / 2;
    const eye_height = bbox1[3] - bbox1[1];

    const width_mult = params.eyebrow_width_l !== null ? params.eyebrow_width_l : uniform(1.0, 1.3);
    const thickness = params.eyebrow_thickness_l !== null ? params.eyebrow_thickness_l : uniform(0.3, 0.6);
    const height_off = params.eyebrow_height_l !== null ? params.eyebrow_height_l : uniform(0, 1);
    const rotation = params.eyebrow_rotation_l !== null ? params.eyebrow_rotation_l * Math.PI / 180 : uniform(-Math.PI / 20, Math.PI / 20);

    const use_arc = params.eyebrow_type_l !== null ? params.eyebrow_type_l === 1 : Math.random() < 0.35;
    const parc = params.eyebrow_arc_l;

    const width = (x1 - x0) * width_mult;
    const height = eye_height * thickness;
    const cy = y1 - eye_height * height_off;

    if (use_arc) {
        const arc_amount = parc !== null ? parc * (width / 2) : uniform(-0.8, 0.8) * (width / 2);
        const cy_draw = cy - Math.max(0, -arc_amount);
        const steps = 12;
        const outer = [], inner = [];
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = cx - width / 2 + width * t;
            const curve = 4 * arc_amount * t * (1 - t);
            outer.push([x, cy_draw - curve]);
            inner.push([x, cy_draw - curve + height]);
        }
        const pts = outer.concat(inner.slice().reverse());
        return pts.map(([x, y]) => rotate_point(x, y, cx, cy_draw, rotation));
    } else {
        const tilt = uniform(-0.4, 0.4) * height;
        const left = cx - width / 2, right = cx + width / 2;
        const pts = [
            [left, cy],
            [right, cy],
            [right, cy + height + tilt],
            [left, cy + height - tilt],
        ];
        return pts.map(([x, y]) => rotate_point(x, y, cx, cy + height / 2, rotation));
    }
}

function generate_mouth(eye_shapes) {
    const lowest_y = Math.max(...eye_shapes.map(eye => Math.max(...eye.map(([, y]) => y))));
    const all_eye_x = eye_shapes.flatMap(eye => eye.map(([x]) => x));
    const cx = (Math.min(...all_eye_x) + Math.max(...all_eye_x)) / 2;
    let cy = lowest_y + uniform(15, 35);

    if (cy > 512) {
        cy = 512 - randint(50, 200);
    }

    const width = params.mouth_width !== null ? 40 + params.mouth_width * (160 - 40) : uniform(40, 160);
    const height = params.mouth_height !== null ? 10 + params.mouth_height * (20 - 10) : uniform(10, 20);
    const angle = params.mouth_angle !== null ? params.mouth_angle * Math.PI / 180 : uniform(-Math.PI / 15, Math.PI / 15);

    const pts = [
        [cx - width / 2, cy - height / 2],
        [cx + width / 2, cy - height / 2],
        [cx + width / 2, cy + height / 2],
        [cx - width / 2, cy + height / 2],
    ];
    return pts.map(([px, py]) => rotate_point(px, py, cx, cy, angle));
}

function generate_open_mouth(eye_shapes, mood) {
    const lowest_y = Math.max(...eye_shapes.map(eye => Math.max(...eye.map(([, y]) => y))));
    const all_eye_x = eye_shapes.flatMap(eye => eye.map(([x]) => x));
    const cx = (Math.min(...all_eye_x) + Math.max(...all_eye_x)) / 2;
    let cy = lowest_y + uniform(15, 35);

    if (cy > 512) {
        cy = 512 - randint(50, 200);
    }

    const width = params.mouth_width !== null ? 40 + params.mouth_width * (200 - 40) : uniform(40, 200);
    const height = params.mouth_height !== null ? 20 + params.mouth_height * (100 - 20) : uniform(20, 100);
    const angle = params.mouth_angle !== null ? params.mouth_angle * Math.PI / 180 : uniform(-Math.PI / 15, Math.PI / 15);

    const x1 = cx - width / 2, y1 = cy;
    const x2 = cx + width / 2, y2 = cy;

    let ctrl_y_offset = 0;
    if (mood === "frown") {
        ctrl_y_offset = -height;
    } else if (mood === "smile") {
        ctrl_y_offset = height;
    }

    const curve = [];
    for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        curve.push(bezier_quadratic(t, [x1, y1], [cx, cy + ctrl_y_offset], [x2, y2]));
    }
    return curve.map(([px, py]) => rotate_point(px, py, cx, cy, angle));
}

function generate_mouth_polygon(cx, cy, rx, ry, start_angle, end_angle, steps = 40, rotation = 0) {
    const rot = rotation * Math.PI / 180;
    const cos_rot = Math.cos(rot);
    const sin_rot = Math.sin(rot);

    const points = [];
    for (let i = 0; i <= steps; i++) {
        const theta = (start_angle + (end_angle - start_angle) * i / steps) * Math.PI / 180;
        const x = rx * Math.cos(theta);
        const y = ry * Math.sin(theta);
        points.push([cx + x * cos_rot - y * sin_rot,
            cy + x * sin_rot + y * cos_rot]);
    }
    return points;
}

function generate_closed_mouth(eye_shapes, mood) {
    const lowest_y = Math.max(...eye_shapes.map(eye => Math.max(...eye.map(([, y]) => y))));
    const all_eye_x = eye_shapes.flatMap(eye => eye.map(([x]) => x));
    const cx = (Math.min(...all_eye_x) + Math.max(...all_eye_x)) / 2;
    let cy = lowest_y + uniform(15, 35);

    const rx = params.mouth_width !== null ? 15 + params.mouth_width * (100 - 15) : uniform(15, 100);
    const ry = params.mouth_height !== null ? 15 + params.mouth_height * (100 - 15) : uniform(15, 100);
    let start_angle = 180;
    let end_angle = 0;
    let smile_offset = 2;

    if (mood === "frown") {
        end_angle = 360;
        smile_offset = -smile_offset;
        cy += ry;
    }

    const rotation = params.mouth_angle !== null ? params.mouth_angle : uniform(-30, 30);
    const margin = uniform(10, 20);

    const outer = generate_mouth_polygon(cx, cy + smile_offset, rx, ry, start_angle, end_angle, 40, rotation);
    const inner = generate_mouth_polygon(cx, cy, rx - margin, ry - margin, start_angle, end_angle, 40, rotation);
    return [outer, inner];
}

function generate_hand() {
    const cx = 256, cy = 256;

    const thumb_width = 20;
    const thumb_height = 100;
    const thumb_left = cx - Math.floor(thumb_width / 2);
    const thumb_right = cx + Math.floor(thumb_width / 2);
    const thumb_top = cy - thumb_height;

    let finger_width = params.finger_length !== null ? params.finger_length : uniform(175, 225);
    if (randint(0, 200) === 100) {
        const t = (finger_width - 175) / 50;
        finger_width = 300 + t * 100;
    }
    const finger_height = 20;
    const finger_top = cy - Math.floor(finger_height / 2);
    const finger_bottom = cy + Math.floor(finger_height / 2);
    const finger_right = cx + finger_width;

    const palm_width = 100;
    const palm_height = 60;
    const palm_left = thumb_left;
    const palm_right = palm_left + palm_width;
    const palm_top = cy;
    const palm_bottom = cy + palm_height;

    const thumb = [
        [thumb_left, cy + 30],
        [thumb_right, cy + 30],
        [thumb_right, thumb_top + 30],
        [thumb_left, thumb_top + 30],
    ];

    const finger = [
        [cx, finger_bottom],
        [finger_right - 30, finger_bottom],
        [finger_right - 30, finger_top],
        [cx, finger_top],
    ];

    const palm = [
        [palm_left, palm_bottom],
        [palm_right, palm_bottom],
        [palm_right, palm_top],
        [palm_left, palm_top],
    ];

    return [thumb, finger, palm];
}

// === Main generation ===

function generate_thonk(seed = null) {
    rng = new Math.seedrandom(seed !== null && seed !== "" ? String(seed) : String(Math.random()), {entropy: false});

    const center = [256, 256];
    const radius = 180;

    const features = [];
    const detached_features = [];

    let face = generate_blob(center, radius);
    const blob_smooth = 5;
    face = chaikin_smooth(face, blob_smooth);
    features.push([face, YELLOW]);
    let mouth_blob = null;

    const inside = randint(1, 20) !== 20;

    let eyes = generate_eyes(face, inside);
    while (eyes.length < 2 ||
    bounding_boxes_collide(bounding_box(eyes[0]), bounding_box(eyes[1]))) {
        eyes = generate_eyes(face, inside);
    }
    let [eye1, eye2] = eyes;

    if (!inside) {
        for (const eye of [eye1, eye2]) {
            const mx = eye.reduce((s, [x]) => s + x, 0) / eye.length;
            const my = eye.reduce((s, [, y]) => s + y, 0) / eye.length;
            let eye_blob = generate_blob([mx, my], 90);
            eye_blob = chaikin_smooth(eye_blob, blob_smooth);
            detached_features.push([eye_blob, YELLOW]);
        }
    }

    const mood = params.mood !== null ? MOODS[params.mood] : choice(MOODS);
    let inner = null;
    let mouth;

    if (mood === "neutral") {
        mouth = generate_mouth(eyes);
    } else if (mood === "smile 2" || mood === "frown 2") {
        mouth = generate_open_mouth(eyes, mood.split(" ")[0]);
    } else {
        [mouth, inner] = generate_closed_mouth(eyes, mood);
    }

    if (!is_polygon_inside_blob(mouth, face)) {
        const mx = mouth.reduce((s, [x]) => s + x, 0) / mouth.length;
        const my = mouth.reduce((s, [, y]) => s + y, 0) / mouth.length;
        mouth_blob = generate_blob([mx, my], 90);
        mouth_blob = chaikin_smooth(mouth_blob, blob_smooth);
        detached_features.push([mouth_blob, YELLOW]);
    }

    features.push([mouth, BROWN]);
    if (inner) {
        features.push([inner, YELLOW]);
    }

    for (const eye of eyes) {
        features.push([chaikin_smooth(eye, blob_smooth), BROWN]);
    }

    const bbox1 = bounding_box(eyes[0]);
    const bbox2 = bounding_box(eyes[1]);

    unibrowed = should_use_unibrow(bbox1, bbox2);
    if (unibrowed) {
        if (Math.min(...eye1.map(([x]) => x)) > Math.min(...eye2.map(([x]) => x))) {
            [eye1, eye2] = [eye2, eye1];
        }

        const brow = generate_unibrow(bbox1, bbox2);

        const brow_bottom = brow.reduce((a, b) => a[1] > b[1] ? a : b);
        const brow_top = brow.reduce((a, b) => a[1] < b[1] ? a : b);
        const higher_eye = Math.min(...eye1.map(([, y]) => y)) < Math.min(...eye2.map(([, y]) => y))
            ? "left" : "right";
        const higher_brow = brow_bottom[0] < brow_top[0] ? "right" : "left";

        let final_brow = brow;
        if (higher_eye !== higher_brow) {
            const center_x = (Math.min(...brow.map(([x]) => x)) + Math.max(...brow.map(([x]) => x))) / 2;
            final_brow = brow.map(([x, y]) => [2 * center_x - x, y]);
        }

        features.push([final_brow, BROWN]);
    } else {
        const bbox_l = bbox1[0] < bbox2[0] ? bbox1 : bbox2;
        const bbox_r = bbox1[0] < bbox2[0] ? bbox2 : bbox1;
        features.push([generate_eyebrow(bbox_l, "l"), BROWN]);
        features.push([generate_eyebrow(bbox_r, "r"), BROWN]);
    }

    const anchor = mouth_blob ? mouth_blob : face;
    const low_point = anchor.reduce((a, b) => a[1] > b[1] ? a : b);

    let [thumb, finger, palm] = generate_hand();
    thumb = chaikin_smooth(thumb, 2);
    finger = chaikin_smooth(finger, 2);

    const palm_top_unsmoothed = [
        [palm[0][0], palm[0][1] - 30],
        [palm[1][0], palm[1][1] - 30],
        palm[2],
        palm[3],
    ];
    palm = chaikin_smooth(palm, 3);

    const base_point = [256, 256];
    const angle = params.hand_angle !== null ? params.hand_angle : uniform(-30, 30);
    const zoom = params.hand_size !== null ? params.hand_size : uniform(0.4, 1);

    thumb = transform_points(thumb, angle, base_point, low_point, zoom);
    finger = transform_points(finger, angle, base_point, low_point, zoom);
    palm = transform_points(palm, angle, base_point, low_point, zoom);
    let palm_top = transform_points(palm_top_unsmoothed, angle, base_point, low_point, zoom);

    const palm_box = bounding_box(palm_top);
    const palm_width = palm_box[2] - palm_box[0];
    const palm_height = palm_box[3] - palm_box[1];
    const hand_anchor = [low_point[0] - palm_width / 2, low_point[1] - palm_height / 2];

    thumb = transform_points(thumb, 0, low_point, hand_anchor, 1);
    finger = transform_points(finger, 0, low_point, hand_anchor, 1);
    palm = transform_points(palm, 0, low_point, hand_anchor, 1);
    palm_top = transform_points(palm_top, 0, low_point, hand_anchor, 1);

    features.push([finger, ORANGE]);
    features.push([thumb, ORANGE]);
    features.push([palm_top, ORANGE]);
    features.push([palm, ORANGE]);

    for (const [points, color] of detached_features) {
        if (!polygons_overlap(face, points)) {
            const mid = closest_midpoint(face, points);
            const bridge = chaikin_smooth(generate_blob(mid, 90), blob_smooth);
            features.unshift([bridge, YELLOW]);
        }
        features.unshift([points, color]);
    }

    return features;
}

// === Rendering ===

function draw_polygon(ctx, points) {
    if (points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.closePath();
}

function render(features, canvas, output_size = 512) {
    const render_size = output_size * 2;
    const scale = render_size / 512;

    const scaled_features = features.map(([pts, color]) => [
        pts.map(([x, y]) => [x * scale, y * scale]),
        color,
    ]);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [pts] of scaled_features) {
        for (const [x, y] of pts) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }
    }

    const content_w = Math.ceil(maxX - minX);
    const content_h = Math.ceil(maxY - minY);

    const offscreen = document.createElement("canvas");
    offscreen.width = content_w;
    offscreen.height = content_h;
    const offCtx = offscreen.getContext("2d");

    for (const [pts, color] of scaled_features) {
        const shifted = pts.map(([x, y]) => [x - minX, y - minY]);
        offCtx.fillStyle = color;
        draw_polygon(offCtx, shifted);
        offCtx.fill();
    }

    const fit_scale = Math.min(render_size / content_w, render_size / content_h);
    const fit_w = Math.round(content_w * fit_scale);
    const fit_h = Math.round(content_h * fit_scale);
    const fit_x = Math.round((render_size - fit_w) / 2);
    const fit_y = Math.round((render_size - fit_h) / 2);

    canvas.width = render_size;
    canvas.height = render_size;
    canvas.style.width = output_size + "px";
    canvas.style.height = output_size + "px";

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, render_size, render_size);
    ctx.drawImage(offscreen, 0, 0, content_w, content_h, fit_x, fit_y, fit_w, fit_h);
}

// === Entry point ===

const R_BROW_SLIDERS = ["eyebrow_type_r", "eyebrow_arc_r", "eyebrow_width_r", "eyebrow_height_r", "eyebrow_thickness_r", "eyebrow_rotation_r"];
const locked = new Set();

function generate() {
    const seedInput = document.getElementById("seedInput");
    const seed = seedInput.value.trim() !== "" ? seedInput.value.trim() : null;

    const features = generate_thonk(seed, 512);

    const canvas = document.getElementById("canvas");
    render(features, canvas, 512);

    for (const name of R_BROW_SLIDERS) {
        const el = document.getElementById(name);
        const row = el.closest(".slider-row");
        el.disabled = unibrowed;
        row.style.opacity = unibrowed ? "0.35" : "";
    }
}

function onSlider(name, el) {
    let val = parseFloat(el.value);
    params[name] = val;
    document.getElementById(name + "-val").textContent = name === "mood"
        ? MOODS[val]
        : (name === "eyebrow_type_l" || name === "eyebrow_type_r")
            ? (val === 0 ? "flat" : "arc")
            : Number.isInteger(val) ? val : val.toFixed(2);
    generate();
}

function copyToClipboard() {
    const canvas = document.getElementById("canvas");
    canvas.toBlob(blob => {
        const item = new ClipboardItem({"image/png": blob});
        navigator.clipboard.write([item]);
    });
}

function randomize() {
    if (!locked.has("seedInput")) {
        document.getElementById("seedInput").value = Math.floor(Math.random() * 1e9);
    }
    generate();
    for (const name of Object.keys(params)) {
        if (locked.has(name)) continue;
        const el = document.getElementById(name);
        const min = parseFloat(el.min);
        const max = parseFloat(el.max);
        const step = parseFloat(el.step);
        const raw = Math.round((Math.random() * (max - min) + min) / step) * step;
        el.value = Math.min(max, Math.max(min, parseFloat(raw.toFixed(10))));
        onSlider(name, el);
    }
}

function toggleLock(name) {
    const btn = document.querySelector(`.lock-btn[data-name="${name}"]`);
    if (locked.has(name)) {
        locked.delete(name);
        btn.classList.remove("locked");
        btn.textContent = "🔓";
    } else {
        locked.add(name);
        btn.classList.add("locked");
        btn.textContent = "🔒";
    }
}

// Randomize sliders and generate on load
document.getElementById("seedInput").value = Math.floor(Math.random() * 1e9);
randomize();
