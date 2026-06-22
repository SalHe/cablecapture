use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

// ── Types ──────────────────────────────────────────────────

#[derive(Copy, Clone, Debug, Serialize, Deserialize)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PackingResult {
    pub positions: Vec<Point>,
    pub enclosing_r: f64,
}

// ── Geometry ───────────────────────────────────────────────

fn dist(a: &Point, b: &Point) -> f64 {
    let dx = a.x - b.x;
    let dy = a.y - b.y;
    (dx * dx + dy * dy).sqrt()
}

fn norm(p: &Point) -> f64 {
    (p.x * p.x + p.y * p.y).sqrt()
}

fn circle_intersection(c1: &Point, r1: f64, c2: &Point, r2: f64) -> Vec<Point> {
    let d = dist(c1, c2);
    if d > r1 + r2 + 1e-9 || d < (r1 - r2).abs() - 1e-9 || d < 1e-9 {
        return vec![];
    }
    let a = (r1 * r1 - r2 * r2 + d * d) / (2.0 * d);
    let h_sq = r1 * r1 - a * a;
    let h = if h_sq > 0.0 { h_sq.sqrt() } else { 0.0 };
    let dx = (c2.x - c1.x) / d;
    let dy = (c2.y - c1.y) / d;
    let mx = c1.x + a * dx;
    let my = c1.y + a * dy;
    let mut r = vec![Point { x: mx + h * (-dy), y: my + h * dx }];
    if h > 1e-9 {
        r.push(Point { x: mx - h * (-dy), y: my - h * dx });
    }
    r
}

fn enclosing_radius(positions: &[Point], radii: &[f64]) -> f64 {
    positions.iter().zip(radii.iter())
        .map(|(p, &r)| norm(p) + r)
        .fold(0.0f64, |a, b| a.max(b))
}

fn max_overlap(positions: &[Point], radii: &[f64]) -> f64 {
    let n = positions.len();
    let mut max_o: f64 = 0.0;
    for i in 0..n {
        for j in (i + 1)..n {
            let d = dist(&positions[i], &positions[j]);
            let min_d = radii[i] + radii[j];
            if d < min_d { max_o = max_o.max(min_d - d); }
        }
    }
    max_o
}

fn recenter(positions: &mut [Point]) {
    let n = positions.len() as f64;
    let mut cx = 0.0; let mut cy = 0.0;
    for p in positions.iter() { cx += p.x; cy += p.y; }
    for p in positions.iter_mut() { p.x -= cx / n; p.y -= cy / n; }
}

// ── Simple RNG ────────────────────────────────────────────

struct XorShift { s0: u64, s1: u64 }

impl XorShift {
    fn new(seed: u64) -> Self {
        let mut r = XorShift { s0: seed ^ 0x9e3779b97f4a7c15, s1: seed.wrapping_add(0x9e3779b97f4a7c15) };
        for _ in 0..8 { r.next(); }
        r
    }
    fn next(&mut self) -> u64 {
        let s1 = self.s0;
        let s0 = self.s1;
        self.s0 = s0;
        let s1 = s1 ^ (s1 << 23);
        self.s1 = s1 ^ s0 ^ (s1 >> 18) ^ (s0 >> 5);
        self.s1.wrapping_add(s0)
    }
    fn f64(&mut self) -> f64 {
        (self.next() as f64) / (u64::MAX as f64)
    }
}

fn shuffle<T: Clone>(a: &[T], rng: &mut XorShift) -> Vec<T> {
    let mut v = a.to_vec();
    for i in (1..v.len()).rev() {
        let j = (rng.f64() * (i as f64 + 1.0)) as usize;
        v.swap(i, j);
    }
    v
}

// ── Phase 1: Greedy ───────────────────────────────────────

fn has_overlap(pos: &[Option<Point>], radii: &[f64], idx: usize, placed: &[usize]) -> bool {
    let p = pos[idx].as_ref().unwrap();
    for &j in placed {
        let pj = pos[j].as_ref().unwrap();
        if dist(p, pj) < radii[idx] + radii[j] - 1e-9 { return true; }
    }
    false
}

fn greedy(radii: &[f64], order: &[usize]) -> Vec<Point> {
    let n = radii.len();
    let mut p: Vec<Option<Point>> = (0..n).map(|_| None).collect();
    let mut placed: Vec<usize> = Vec::with_capacity(n);

    p[order[0]] = Some(Point { x: 0.0, y: 0.0 });
    placed.push(order[0]);

    for k in 1..n {
        let idx = order[k];
        let r = radii[idx];
        let mut best_p = Point { x: 0.0, y: r + radii[order[0]] };
        let mut best_est = f64::INFINITY;

        // Tangent to pairs
        for a in 0..placed.len() {
            for b in (a + 1)..placed.len() {
                let ia = placed[a]; let ib = placed[b];
                let pa = p[ia].as_ref().unwrap(); let pb = p[ib].as_ref().unwrap();
                for cand in circle_intersection(pa, radii[ia] + r, pb, radii[ib] + r) {
                    p[idx] = Some(cand.clone());
                    if !has_overlap(&p, radii, idx, &placed) {
                        let est = norm(&cand) + r;
                        if est < best_est { best_est = est; best_p = cand; }
                    }
                }
            }
        }

        // Tangent to one + origin direction
        for &ia in &placed {
            let ca = p[ia].as_ref().unwrap();
            let da = radii[ia] + r;
            let ang = ca.y.atan2(ca.x);
            for cand in [
                Point { x: ca.x - ang.cos() * da, y: ca.y - ang.sin() * da },
                Point { x: ca.x + ang.cos() * da, y: ca.y + ang.sin() * da },
            ] {
                p[idx] = Some(cand.clone());
                if !has_overlap(&p, radii, idx, &placed) {
                    let est = norm(&cand) + r;
                    if est < best_est { best_est = est; best_p = cand; }
                }
            }
        }

        p[idx] = Some(best_p);
        placed.push(idx);
    }

    let mut result: Vec<Point> = p.into_iter().map(|o| o.unwrap()).collect();
    recenter(&mut result);
    result
}

// ── Phase 2: Force refinement ─────────────────────────────

fn force_refine(positions: &mut [Point], radii: &[f64], max_iter: usize) -> f64 {
    let n = positions.len();
    if n <= 1 { return enclosing_radius(positions, radii); }

    let mut cur_r = enclosing_radius(positions, radii);
    let mut target_r = cur_r * 0.85;
    let mut stable = 0usize;
    let mut best_r = cur_r;
    let mut best_pos = positions.to_vec();

    for iter in 0..max_iter {
        let mut fx = vec![0.0f64; n];
        let mut fy = vec![0.0f64; n];
        let mut max_ov: f64 = 0.0;

        for i in 0..n {
            for j in (i + 1)..n {
                let dx = positions[i].x - positions[j].x;
                let dy = positions[i].y - positions[j].y;
                let d = (dx * dx + dy * dy).sqrt();
                let md = radii[i] + radii[j];
                if d < md && d > 1e-10 {
                    let ov = md - d;
                    max_ov = max_ov.max(ov);
                    let k = 0.45 + 0.3 * (ov / radii[i].max(radii[j]).max(0.01)).min(1.0);
                    let f = ov * k;
                    fx[i] += (dx / d) * f; fy[i] += (dy / d) * f;
                    fx[j] -= (dx / d) * f; fy[j] -= (dy / d) * f;
                } else if d < 1e-10 {
                    fx[i] += 0.05; fy[i] += 0.05;
                    fx[j] -= 0.05; fy[j] -= 0.05;
                }
            }
        }

        cur_r = enclosing_radius(positions, radii);
        let eff_t = target_r.max(cur_r * 0.75);
        let mut max_wp = 0.0f64;

        for i in 0..n {
            let d = norm(&positions[i]);
            if d < 1e-10 { continue; }
            let cp = 0.015 + d * 0.02;
            fx[i] -= (positions[i].x / d) * cp;
            fy[i] -= (positions[i].y / d) * cp;
            let md = eff_t - radii[i];
            if d > md {
                let pen = d - md;
                max_wp = max_wp.max(pen);
                let ws = 0.6 + pen * 0.3;
                fx[i] -= (positions[i].x / d) * pen * ws;
                fy[i] -= (positions[i].y / d) * pen * ws;
            }
        }

        let damp = if max_ov > 0.01 { 0.75 } else if max_wp > 0.001 { 0.85 } else { 0.7 };
        for i in 0..n { positions[i].x += fx[i] * damp; positions[i].y += fy[i] * damp; }

        if max_ov < 1e-6 { target_r *= 0.9985; stable += 1; }
        else { target_r = target_r.max(cur_r * 0.95); stable = 0; }

        if max_ov < 1e-7 && max_wp < 1e-7 && cur_r < best_r {
            best_r = cur_r; best_pos = positions.to_vec();
        }

        if stable > 400 && max_ov < 1e-8 && max_wp < 1e-8 {
            let mut sr = XorShift::new((iter * 131 + (cur_r * 1000.0) as usize) as u64);
            let sa = cur_r * 0.002;
            for i in 0..n {
                positions[i].x += (sr.f64() - 0.5) * sa;
                positions[i].y += (sr.f64() - 0.5) * sa;
            }
            target_r = cur_r * 0.99; stable = 0;
        }

        if max_ov < 1e-9 && max_wp < 1e-9 && stable > 150 { break; }
    }

    positions.clone_from_slice(&best_pos);
    best_r
}

// ── Overlap safety ─────────────────────────────────────────

fn resolve_overlaps(positions: &mut [Point], radii: &[f64]) {
    let n = positions.len();
    if n <= 1 { return; }
    for _ in 0..500 {
        let mut max_ov: f64 = 0.0;
        for i in 0..n {
            for j in (i + 1)..n {
                let dx = positions[i].x - positions[j].x;
                let dy = positions[i].y - positions[j].y;
                let d = (dx * dx + dy * dy).sqrt();
                let md = radii[i] + radii[j];
                if d < md && d > 1e-10 {
                    let ov = md - d; max_ov = max_ov.max(ov);
                    let hm = ov * 0.55;
                    positions[i].x += (dx / d) * hm; positions[i].y += (dy / d) * hm;
                    positions[j].x -= (dx / d) * hm; positions[j].y -= (dy / d) * hm;
                } else if d < 1e-10 {
                    positions[i].x += 0.01; positions[j].x -= 0.01;
                }
            }
        }
        if max_ov < 1e-9 { break; }
    }
    let rem = max_overlap(positions, radii);
    if rem > 1e-6 {
        let s = 1.0 + rem / enclosing_radius(positions, radii);
        for p in positions.iter_mut() { p.x *= s; p.y *= s; }
    }
}

// ── Full pipeline ──────────────────────────────────────────

fn run_one(radii: &[f64], order: &[usize], rng: &mut XorShift) -> (Vec<Point>, f64) {
    let mut pos = greedy(radii, order);
    optimize(&mut pos, radii, rng)
}

fn optimize(positions: &mut Vec<Point>, radii: &[f64], _rng: &mut XorShift) -> (Vec<Point>, f64) {
    let _ = force_refine(positions, radii, 3000);
    resolve_overlaps(positions, radii);
    let r = enclosing_radius(positions, radii);
    (positions.clone(), r)
}

/// Ring placement: put the N largest equal circles equally spaced on a ring,
/// then greedily place the rest. This directly captures the optimal topology
/// for patterns like 3×large + N×small.
fn ring_start(radii: &[f64]) -> Vec<Point> {
    let n = radii.len();
    let mut positions = vec![Point { x: 0.0, y: 0.0 }; n];

    // Find the largest radius and count how many circles share it
    let max_r = radii.iter().cloned().fold(0.0f64, f64::max);
    let large_count = radii.iter().filter(|&&r| (r - max_r).abs() < 1e-9).count();

    // Only use ring strategy if there are 3+ equal largest circles
    if large_count < 3 || large_count == n {
        return greedy(radii, &(0..n).collect::<Vec<_>>());
    }

    // Separate large and small circle indices
    let mut large_idx: Vec<usize> = Vec::new();
    let mut small_idx: Vec<usize> = Vec::new();
    for i in 0..n {
        if (radii[i] - max_r).abs() < 1e-9 {
            large_idx.push(i);
        } else {
            small_idx.push(i);
        }
    }

    // Place large circles on a ring
    // Ring radius d such that adjacent circles touch: d * sin(π/N) = r, so d = r / sin(π/N)
    let d = max_r / (std::f64::consts::PI / large_count as f64).sin();
    for (i, &idx) in large_idx.iter().enumerate() {
        let angle = 2.0 * std::f64::consts::PI * i as f64 / large_count as f64;
        positions[idx] = Point { x: d * angle.cos(), y: d * angle.sin() };
    }

    // Greedily place remaining small circles among the large ones
    let mut placed: Vec<usize> = large_idx.clone();
    for &idx in &small_idx {
        let r = radii[idx];
        let mut best_pos = Point { x: 0.0, y: 0.0 };
        let mut best_est = f64::INFINITY;

        // Tangent to pairs of placed circles
        for a in 0..placed.len() {
            for b in (a + 1)..placed.len() {
                let ia = placed[a]; let ib = placed[b];
                for cand in circle_intersection(&positions[ia], radii[ia] + r, &positions[ib], radii[ib] + r) {
                    let mut ok = true;
                    for &j in &placed {
                        if dist(&cand, &positions[j]) < r + radii[j] - 1e-9 { ok = false; break; }
                    }
                    if ok {
                        let est = norm(&cand) + r;
                        if est < best_est { best_est = est; best_pos = cand; }
                    }
                }
            }
        }

        // Also try toward origin from each placed circle
        for &ia in &placed {
            let ca = &positions[ia];
            let da = radii[ia] + r;
            let ang = ca.y.atan2(ca.x);
            for cand in [
                Point { x: ca.x - ang.cos() * da, y: ca.y - ang.sin() * da },
            ] {
                let mut ok = true;
                for &j in &placed {
                    if j == ia { continue; }
                    if dist(&cand, &positions[j]) < r + radii[j] - 1e-9 { ok = false; break; }
                }
                if ok {
                    let est = norm(&cand) + r;
                    if est < best_est { best_est = est; best_pos = cand; }
                }
            }
        }

        positions[idx] = best_pos;
        placed.push(idx);
    }

    recenter(&mut positions);
    positions
}

// ── WASM export ───────────────────────────────────────────

#[wasm_bindgen]
pub fn pack_circles(radii: Vec<f64>) -> JsValue {
    let n = radii.len();
    if n == 0 {
        return serde_wasm_bindgen::to_value(&PackingResult {
            positions: vec![], enclosing_r: 0.0
        }).unwrap();
    }
    if n == 1 {
        return serde_wasm_bindgen::to_value(&PackingResult {
            positions: vec![Point { x: 0.0, y: 0.0 }],
            enclosing_r: radii[0],
        }).unwrap();
    }

    let indices: Vec<usize> = (0..n).collect();
    let mut lf = indices.clone();
    lf.sort_by(|&a, &b| radii[b].partial_cmp(&radii[a]).unwrap_or(std::cmp::Ordering::Equal));
    let mut sf = indices.clone();
    sf.sort_by(|&a, &b| radii[a].partial_cmp(&radii[b]).unwrap_or(std::cmp::Ordering::Equal));

    let num_random = (4usize).min((15 / n).max(1));
    let mut rng = XorShift::new(42);
    let mut orders = vec![lf, sf];
    for _ in 0..num_random { orders.push(shuffle(&indices, &mut rng)); }

    let mut best_pos = vec![];
    let mut best_r = f64::INFINITY;

    // Try ring placement first (catches 3-large + N-small pattern)
    {
        let ring_pos = ring_start(&radii);
        let (pos, r) = optimize(&mut ring_pos.clone(), &radii, &mut rng);
        if r < best_r { best_r = r; best_pos = pos; }
    }

    for order in &orders {
        let (pos, r) = run_one(&radii, order, &mut rng);
        if r < best_r { best_r = r; best_pos = pos; }
    }

    serde_wasm_bindgen::to_value(&PackingResult {
        positions: best_pos,
        enclosing_r: best_r,
    }).unwrap()
}
