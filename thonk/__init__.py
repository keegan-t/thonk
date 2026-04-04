import math
import random

from PIL import Image, ImageDraw

YELLOW = (255, 203, 76)
BROWN = (101, 71, 27)
ORANGE = (241, 144, 32)


# ===== Shape generators =====

def generate_blob(center, radius):
    spikiness = random.uniform(0, 1)
    point_count = random.randint(6, 18)
    cx, cy = center
    angle_step = 2 * math.pi / point_count

    points = []
    for i in range(point_count):
        angle = i * angle_step
        r = radius * (1 + random.uniform(-spikiness, spikiness))
        points.append((cx + r * math.cos(angle), cy + r * math.sin(angle)))

    return points


def generate_eyes(face_polygon, inside=True):
    eye_radius = random.randint(20, 50)
    eyes = []
    for _ in range(2):
        center = random_point_in_polygon(face_polygon, inside)
        if center is None:
            continue
        eyes.append(generate_eye(center, eye_radius))
    return eyes


def generate_eye(center, radius):
    spikiness = random.uniform(0, 0.5)
    point_count = random.randint(4, 8)
    cx, cy = center
    angle_step = 2 * math.pi / point_count

    points = []
    for i in range(point_count):
        angle = i * angle_step
        r = radius * (1 + random.uniform(-spikiness, spikiness))
        points.append((cx + r * math.cos(angle), cy + r * math.sin(angle)))

    return points


def generate_eyebrow(eye_bbox):
    x0, y0, x1, y1 = eye_bbox
    eye_width = x1 - x0
    eye_height = y1 - y0
    cx = (x0 + x1) / 2

    width = eye_width * random.uniform(1.0, 2.2)
    height = eye_height * random.uniform(0.2, 0.5)
    top = y0 - eye_height * random.uniform(0, 1)
    arc = random.uniform(-0.3, 0.3) * height

    left, right = cx - width / 2, cx + width / 2
    points = [
        (left, top),
        (right, top),
        (right, top + height + arc),
        (left, top + height - arc),
    ]

    rotation = random.uniform(-math.pi / 6, math.pi / 6)
    return [rotate_point(x, y, cx, top + height / 2, rotation) for x, y in points]


def generate_unibrow(bbox1, bbox2):
    x0 = min(bbox1[0], bbox2[0])
    x1 = max(bbox1[2], bbox2[2])
    y1 = min(bbox1[1], bbox2[1])
    cx = (x0 + x1) / 2

    width = (x1 - x0) * random.uniform(1.0, 1.3)
    height = (bbox1[3] - bbox1[1]) * random.uniform(0.3, 0.6)
    top = y1 - random.uniform(5, 15)
    arc = random.uniform(-0.4, 0.4) * height

    left, right = cx - width / 2, cx + width / 2
    points = [
        (left, top),
        (right, top),
        (right, top + height + arc),
        (left, top + height - arc),
    ]

    rotation = random.uniform(-math.pi / 20, math.pi / 20)
    return [rotate_point(x, y, cx, top + height / 2, rotation) for x, y in points]


def generate_mouth(eye_shapes):
    lowest_y = max(max(y for _, y in eye) for eye in eye_shapes)
    all_eye_x = [x for eye in eye_shapes for x, _ in eye]
    cx = (min(all_eye_x) + max(all_eye_x)) / 2
    cy = lowest_y + random.uniform(15, 35)

    if cy > 512:
        cy = 512 - random.randint(50, 200)

    width = random.uniform(40, 160)
    height = random.uniform(10, 20)
    angle = random.uniform(-math.pi / 15, math.pi / 15)

    points = [
        (cx - width / 2, cy - height / 2),
        (cx + width / 2, cy - height / 2),
        (cx + width / 2, cy + height / 2),
        (cx - width / 2, cy + height / 2),
    ]
    return [rotate_point(px, py, cx, cy, angle) for px, py in points]


def generate_open_mouth(eye_shapes, mood):
    lowest_y = max(max(y for _, y in eye) for eye in eye_shapes)
    all_eye_x = [x for eye in eye_shapes for x, _ in eye]
    cx = (min(all_eye_x) + max(all_eye_x)) / 2
    cy = lowest_y + random.uniform(15, 35)

    if cy > 512:
        cy = 512 - random.randint(50, 200)

    width = random.uniform(40, 200)
    height = random.uniform(20, 100)
    angle = random.uniform(-math.pi / 15, math.pi / 15)

    x1, y1 = cx - width / 2, cy
    x2, y2 = cx + width / 2, cy

    ctrl_y_offset = 0
    if mood == "frown":
        ctrl_y_offset = -height
    elif mood == "smile":
        ctrl_y_offset = height

    curve = [
        bezier_quadratic(t, (x1, y1), (cx, cy + ctrl_y_offset), (x2, y2))
        for t in [i / 20 for i in range(21)]
    ]
    return [rotate_point(px, py, cx, cy, angle) for px, py in curve]


def generate_closed_mouth(eye_shapes, mood):
    lowest_y = max(max(y for _, y in eye) for eye in eye_shapes)
    all_eye_x = [x for eye in eye_shapes for x, _ in eye]
    cx = (min(all_eye_x) + max(all_eye_x)) / 2
    cy = lowest_y + random.uniform(15, 35)

    rx = random.uniform(15, 100)
    ry = random.uniform(15, 100)
    start_angle = 180
    end_angle = 0
    smile_offset = 2

    if mood == "frown":
        end_angle = 360
        smile_offset = -smile_offset
        cy += ry

    rotation = random.uniform(-30, 30)
    margin = random.uniform(10, 20)

    outer = generate_mouth_polygon(cx, cy + smile_offset, rx, ry, start_angle, end_angle, rotation=rotation)
    inner = generate_mouth_polygon(cx, cy, rx - margin, ry - margin, start_angle, end_angle, rotation=rotation)
    return outer, inner


def generate_mouth_polygon(cx, cy, rx, ry, start_angle, end_angle, steps=300, rotation=0):
    rot = math.radians(rotation)
    cos_rot = math.cos(rot)
    sin_rot = math.sin(rot)

    points = []
    for i in range(steps + 1):
        theta = math.radians(start_angle + (end_angle - start_angle) * i / steps)
        x = rx * math.cos(theta)
        y = ry * math.sin(theta)
        points.append((cx + x * cos_rot - y * sin_rot,
                       cy + x * sin_rot + y * cos_rot))
    return points


def generate_hand():
    cx, cy = 256, 256

    thumb_width = 20
    thumb_height = 100
    thumb_left = cx - thumb_width // 2
    thumb_right = cx + thumb_width // 2
    thumb_top = cy - thumb_height

    finger_width = random.uniform(175, 225)
    if random.randint(0, 200) == 100:  # rare long finger
        finger_width = random.uniform(300, 400)
    finger_height = 20
    finger_top = cy - finger_height // 2
    finger_bottom = cy + finger_height // 2
    finger_right = cx + finger_width

    palm_width = 100
    palm_height = 60
    palm_left = thumb_left
    palm_right = palm_left + palm_width
    palm_top = cy
    palm_bottom = cy + palm_height

    thumb = [
        (thumb_left, cy + 30),
        (thumb_right, cy + 30),
        (thumb_right, thumb_top + 30),
        (thumb_left, thumb_top + 30),
    ]

    finger = [
        (cx, finger_bottom),
        (finger_right - 30, finger_bottom),
        (finger_right - 30, finger_top),
        (cx, finger_top),
    ]

    palm = [
        (palm_left, palm_bottom),
        (palm_right, palm_bottom),
        (palm_right, palm_top),
        (palm_left, palm_top),
    ]

    return thumb, finger, palm


# ===== Geometry helpers =====

def polygons_overlap(poly1, poly2):
    return any(point_in_polygon(x, y, poly2) for x, y in poly1) or \
        any(point_in_polygon(x, y, poly1) for x, y in poly2)


def closest_midpoint(poly1, poly2):
    min_dist = float('inf')
    closest_pair = (None, None)

    for p1 in poly1:
        for p2 in poly2:
            dist = math.hypot(p1[0] - p2[0], p1[1] - p2[1])
            if dist < min_dist:
                min_dist = dist
                closest_pair = (p1, p2)

    (x1, y1), (x2, y2) = closest_pair
    return (x1 + x2) / 2, (y1 + y2) / 2


def random_point_in_polygon(polygon, inside=True):
    min_x = min(p[0] for p in polygon)
    max_x = max(p[0] for p in polygon)
    min_y = min(p[1] for p in polygon)
    max_y = max(p[1] for p in polygon)

    for _ in range(100):
        x = random.uniform(min_x, max_x)
        y = random.uniform(min_y, max_y)
        if inside == point_in_polygon(x, y, polygon):
            return x, y

    return None


def bounding_box(points):
    xs, ys = zip(*points)
    return min(xs), min(ys), max(xs), max(ys)


def bounding_boxes_collide(box1, box2):
    x1_min, y1_min, x1_max, y1_max = box1
    x2_min, y2_min, x2_max, y2_max = box2
    return not (x1_max < x2_min or x1_min > x2_max or
                y1_max < y2_min or y1_min > y2_max)


def should_use_unibrow(bbox1, bbox2, max_diff=75):
    return abs(bbox1[1] - bbox2[1]) < max_diff


def point_in_polygon(x, y, polygon):
    inside = False
    px, py = polygon[-1]
    for cx, cy in polygon:
        if ((cy > y) != (py > y)) and (x < (px - cx) * (y - cy) / (py - cy + 1e-10) + cx):
            inside = not inside
        px, py = cx, cy
    return inside


def is_polygon_inside_blob(polygon, blob):
    return all(point_in_polygon(x, y, blob) for x, y in polygon)


def offset_points(points, dx, dy):
    return [(x + dx, y + dy) for x, y in points]


# ===== Shape modifiers =====

def chaikin_smooth(points, iterations=2):
    for _ in range(iterations):
        new_points = []
        for i in range(len(points)):
            p0 = points[i]
            p1 = points[(i + 1) % len(points)]
            new_points.append((0.75 * p0[0] + 0.25 * p1[0], 0.75 * p0[1] + 0.25 * p1[1]))
            new_points.append((0.25 * p0[0] + 0.75 * p1[0], 0.25 * p0[1] + 0.75 * p1[1]))
        points = new_points
    return points


def rotate_point(x, y, cx, cy, angle_rad):
    cos_a = math.cos(angle_rad)
    sin_a = math.sin(angle_rad)
    dx, dy = x - cx, y - cy
    return (cx + dx * cos_a - dy * sin_a,
            cy + dx * sin_a + dy * cos_a)


def bezier_quadratic(t, p0, p1, p2):
    x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t ** 2 * p2[0]
    y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t ** 2 * p2[1]
    return (x, y)


def transform_points(points, angle_deg=0, current_origin=(0, 0), new_origin=(0, 0), zoom=1.0):
    angle_rad = math.radians(angle_deg)
    cos_a, sin_a = math.cos(angle_rad), math.sin(angle_rad)
    cx, cy = current_origin
    nx, ny = new_origin
    dx, dy = nx - cx, ny - cy

    transformed = []
    for x, y in points:
        sx, sy = x + dx, y + dy
        tx, ty = (sx - nx) * zoom, (sy - ny) * zoom
        transformed.append((tx * cos_a - ty * sin_a + nx,
                            tx * sin_a + ty * cos_a + ny))
    return transformed


def extend_canvas_if_needed(img, bbox):
    min_x, min_y, max_x, max_y = bbox
    old_w, old_h = img.size

    extra_left = max(0, -int(min_x))
    extra_top = max(0, -int(min_y))
    extra_right = max(0, int(max_x - old_w))
    extra_bottom = max(0, int(max_y - old_h))

    if not any((extra_left, extra_top, extra_right, extra_bottom)):
        return img, (0, 0)

    new_w = old_w + extra_left + extra_right
    new_h = old_h + extra_top + extra_bottom
    new_img = Image.new("RGBA", (new_w, new_h), (0, 0, 0, 0))
    new_img.paste(img, (extra_left, extra_top))
    return new_img, (extra_left, extra_top)


# ===== Public API =====

def generate_thonk(seed=None, output_size=512):
    """Generate a randomized thonk emoji.

    Args:
        seed: Any hashable value - same seed always produces the same image.
              If not provided, a random image is generated each call.
        output_size: Side length in pixels of the returned square image (default 512).

    Returns:
        A PIL.Image.Image in RGBA mode.
    """
    random.seed(seed)

    center = (256, 256)
    radius = 180

    features = []
    detached_features = []

    # Face
    face = generate_blob(center, radius)
    face = chaikin_smooth(face, 5)
    features.append((face, YELLOW))
    mouth_blob = None

    # Eyes - 1/20 chance to be placed outside the face
    inside = random.randint(1, 20) != 20

    eyes = generate_eyes(face, inside)
    while len(eyes) < 2 or bounding_boxes_collide(bounding_box(eyes[0]), bounding_box(eyes[1])):
        eyes = generate_eyes(face, inside)
    eye1, eye2 = eyes

    if not inside:
        # Grow a blob around each eye to avoid floating features
        for eye in (eye1, eye2):
            mx = sum(x for x, _ in eye) / len(eye)
            my = sum(y for _, y in eye) / len(eye)
            eye_blob = generate_blob((mx, my), 90)
            eye_blob = chaikin_smooth(eye_blob, iterations=5)
            detached_features.append((eye_blob, YELLOW))

    # Mouth
    mood = random.choice(["neutral", "smile", "frown", "open smile", "open frown"])
    inner = None

    if mood == "neutral":
        mouth = generate_mouth(eyes)
    elif mood in ("open smile", "open frown"):
        mouth = generate_open_mouth(eyes, mood.split(" ")[1])
    else:
        mouth, inner = generate_closed_mouth(eyes, mood)

    if not is_polygon_inside_blob(mouth, face):
        # Grow a blob around the mouth for the same reason
        mx = sum(x for x, _ in mouth) / len(mouth)
        my = sum(y for _, y in mouth) / len(mouth)
        mouth_blob = generate_blob((mx, my), 90)
        mouth_blob = chaikin_smooth(mouth_blob, iterations=5)
        detached_features.append((mouth_blob, YELLOW))

    features.append((mouth, BROWN))
    if inner:
        features.append((inner, YELLOW))

    for eye in eyes:
        features.append((chaikin_smooth(eye, iterations=5), BROWN))

    # Eyebrows
    bbox1, bbox2 = bounding_box(eyes[0]), bounding_box(eyes[1])
    if should_use_unibrow(bbox1, bbox2):
        # Sort eyes from left to right so the unibrow tilt matches which eye is higher
        if min(x for x, _ in eye1) > min(x for x, _ in eye2):
            eye1, eye2 = eye2, eye1

        brow = generate_unibrow(bbox1, bbox2)

        # Mirror the brow if its tilt doesn't match the eye heights
        brow_bottom = max(brow, key=lambda p: p[1])
        brow_top = min(brow, key=lambda p: p[1])
        higher_eye = "left" if min(y for _, y in eye1) < min(y for _, y in eye2) else "right"
        higher_brow = "right" if brow_bottom[0] < brow_top[0] else "left"

        if higher_eye != higher_brow:
            center_x = (min(x for x, _ in brow) + max(x for x, _ in brow)) / 2
            brow = [(2 * center_x - x, y) for x, y in brow]

        features.append((brow, BROWN))
    else:
        features.append((generate_eyebrow(bbox1), BROWN))
        features.append((generate_eyebrow(bbox2), BROWN))

    # Hand
    anchor = mouth_blob if mouth_blob else face
    low_point = max(anchor, key=lambda p: p[1])

    thumb, finger, palm = generate_hand()
    thumb = chaikin_smooth(thumb, iterations=2)
    finger = chaikin_smooth(finger, iterations=2)

    # Capture the palm's top edge before smoothing for accurate centering
    palm_top_unsmoothed = [(palm[0][0], palm[0][1] - 30),
                           (palm[1][0], palm[1][1] - 30),
                           palm[2], palm[3]]
    palm = chaikin_smooth(palm, iterations=3)

    base_point = (256, 256)
    angle = random.uniform(-30, 30)
    zoom = random.uniform(0.4, 1)

    # First pass: rotate and scale the hand around the face's lowest point
    thumb = transform_points(thumb, angle_deg=angle, current_origin=base_point, new_origin=low_point, zoom=zoom)
    finger = transform_points(finger, angle_deg=angle, current_origin=base_point, new_origin=low_point, zoom=zoom)
    palm = transform_points(palm, angle_deg=angle, current_origin=base_point, new_origin=low_point, zoom=zoom)
    palm_top = transform_points(palm_top_unsmoothed, angle_deg=angle, current_origin=base_point, new_origin=low_point, zoom=zoom)

    # Second pass: nudge the hand so the palm top is centered on low_point
    palm_box = bounding_box(palm_top)
    palm_width = palm_box[2] - palm_box[0]
    palm_height = palm_box[3] - palm_box[1]
    hand_anchor = (low_point[0] - palm_width / 2, low_point[1] - palm_height / 2)

    thumb = transform_points(thumb, current_origin=low_point, new_origin=hand_anchor)
    finger = transform_points(finger, current_origin=low_point, new_origin=hand_anchor)
    palm = transform_points(palm, current_origin=low_point, new_origin=hand_anchor)
    palm_top = transform_points(palm_top, current_origin=low_point, new_origin=hand_anchor)

    features.extend([
        (finger, ORANGE),
        (thumb, ORANGE),
        (palm_top, ORANGE),
        (palm, ORANGE),
    ])

    # Bridge any disconnected features back to the face
    for points, color in detached_features:
        if not polygons_overlap(face, points):
            mid = closest_midpoint(face, points)
            bridge = chaikin_smooth(generate_blob(mid, 90), iterations=5)
            features.insert(0, (bridge, YELLOW))
        features.insert(0, (points, color))

    render_size = output_size * 2
    scale = render_size / 512

    scaled_features = [
        ([(x * scale, y * scale) for x, y in pts], color)
        for pts, color in features
    ]

    img = Image.new("RGBA", (render_size, render_size), (0, 0, 0, 0))
    all_points = [p for pts, _ in scaled_features for p in pts]
    img, offset = extend_canvas_if_needed(img, bounding_box(all_points))
    draw = ImageDraw.Draw(img)
    dx, dy = offset

    for points, color in scaled_features:
        draw.polygon(offset_points(points, dx, dy), fill=color)

    return img.resize((output_size, output_size), resample=Image.LANCZOS)
