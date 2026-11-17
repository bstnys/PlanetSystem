// 행성계 시뮬레이션 — 항성 · 행성 · 위성의 공전과 자전 + 중력에 끌려가는 소행성
// Flocking 예제의 구조를 참고했습니다.
//   · SolarSystem(관리 클래스) 이 천체 배열을 돌리면서 run() 합니다. (Flock 과 같은 역할)
//   · Asteroid 는 Boid 처럼 applyForce → update → render 순서로 움직입니다.
//     Boid 의 힘이 분리·정렬·응집이었다면, 소행성의 힘은 "모든 천체의 중력의 합" 입니다.
//
// 조작
//   · 클릭            : 그 자리에 소행성 생성 (태양 둘레를 도는 속도로 출발)
//   · 드래그 후 놓기  : 드래그한 방향·길이만큼 소행성을 던지기 (예상 궤도가 미리 보여요)
//   · 스페이스바      : 테라에서 랜덤한 행성을 향해 로켓 순행 발사
//   · C 키            : 소행성 모두 지우기

const G = 1;          // 중력 상수 (화면용으로 단순화)
let system;
let stars = [];
let dragStart = null;

function setup() {
  createCanvas(windowWidth, windowHeight);
  system = new SolarSystem(width / 2, height / 2);

  for (let i = 0; i < 260; i++) {
    stars.push({ x: random(), y: random(), s: random(0.5, 2), t: random(TWO_PI) });
  }

  describe(
    'A star at the center with planets orbiting and spinning, moons orbiting the planets, and asteroids created by mouse clicks that curve under gravity.'
  );
}

function draw() {
  background(4, 6, 16);
  drawStars();
  system.run();
  drawAim();
  drawHud();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  system = new SolarSystem(width / 2, height / 2);
}

// ── 마우스 / 키보드 ─────────────────────────────

function mousePressed() {
  dragStart = createVector(mouseX, mouseY);
}

function mouseReleased() {
  if (!dragStart) return;
  let vel = launchVelocity(dragStart, createVector(mouseX, mouseY));
  system.addAsteroid(new Asteroid(dragStart.x, dragStart.y, vel));
  dragStart = null;
}

function keyPressed() {
  if (key === 'c' || key === 'C') system.asteroids = [];
  if (key === ' ') {
    system.launchRocket();
    return false; // 스페이스바로 페이지가 스크롤되지 않게
  }
}

// 드래그가 짧으면(그냥 클릭) 태양 둘레를 도는 속도, 길면 드래그한 방향으로 던지기
function launchVelocity(start, end) {
  let drag = p5.Vector.sub(end, start);
  if (drag.mag() < 8) {
    return system.orbitalVelocity(start).mult(random(0.75, 1.05));
  }
  return drag.mult(0.04);
}

// ── 화면 요소 ─────────────────────────────────

function drawStars() {
  noStroke();
  for (let s of stars) {
    let a = 140 + 110 * sin(frameCount * 0.02 + s.t);
    fill(255, a);
    circle(s.x * width, s.y * height, s.s);
  }
}

// 드래그 중: 던질 방향 화살표 + 예상 궤도
function drawAim() {
  if (!dragStart || !mouseIsPressed) return;
  let end = createVector(mouseX, mouseY);
  let vel = launchVelocity(dragStart, end);
  // launchVelocity 는 클릭일 때 랜덤을 섞으므로, 미리보기는 랜덤 없는 값으로
  if (p5.Vector.dist(dragStart, end) < 8) vel = system.orbitalVelocity(dragStart).mult(0.9);

  // 예상 궤도 (천체가 앞으로 움직일 위치까지 고려해서 계산)
  let path = system.predict(dragStart, vel, 260);
  noStroke();
  for (let i = 0; i < path.length; i += 3) {
    fill(255, 210, 140, map(i, 0, path.length, 200, 20));
    circle(path[i].x, path[i].y, 2.5);
  }

  // 화살표
  stroke(255, 200, 120);
  strokeWeight(1.5);
  line(dragStart.x, dragStart.y, end.x, end.y);
  noStroke();
  fill(200, 180, 160);
  circle(dragStart.x, dragStart.y, 8);
}

function drawHud() {
  noStroke();
  fill(220);
  textAlign(LEFT, TOP);
  textSize(14);
  text('클릭: 소행성 만들기   ·   드래그 후 놓기: 소행성 던지기   ·   스페이스바: 로켓 발사   ·   C: 소행성 지우기', 16, 14);
  fill(150);
  text('소행성 ' + system.asteroids.length + '개   ·   비행 중인 로켓 ' + system.rockets.length + '대', 16, 34);
  // 최근 로켓 기록
  for (let i = 0; i < system.log.length; i++) {
    fill(170, 220, 255, 230 - i * 45);
    text(String(system.log[i]), 16, 58 + i * 18);
  }
}

// ── 행성계 관리 (Flock 과 같은 역할) ─────────────────

class SolarSystem {
  constructor(x, y) {
    // 화면 크기에 맞춰 전체 크기를 조절 (질량은 크기³ 로 맞춰서 움직임 속도는 똑같이)
    this.s = min(width, height) / 780;
    let s = this.s;
    let m = s * s * s;

    this.sun = new Sun(x, y, 28 * s, 700 * m);

    // 행성: 이름, 궤도 반지름, 크기, 질량, 색, 자전 속도(음수면 반대로 돔), 위성들
    this.sun.addChild(new Planet({
      name: '메르', orbit: 72 * s, radius: 5 * s, mass: 8 * m,
      color: [170, 165, 160], spot: [115, 110, 105], spin: 0.02
    }));

    let terra = this.sun.addChild(new Planet({
      name: '테라', orbit: 120 * s, radius: 9 * s, mass: 40 * m,
      color: [80, 160, 230], spot: [90, 190, 110], spin: 0.04
    }));
    terra.addChild(new Planet({
      name: '', orbit: 22 * s, radius: 3 * s, mass: 2 * m,
      color: [190, 190, 185], spot: [140, 140, 135], spin: 0.02, isMoon: true
    }));

    let mar = this.sun.addChild(new Planet({
      name: '마르', orbit: 185 * s, radius: 7 * s, mass: 22 * m,
      color: [205, 95, 60], spot: [150, 60, 40], spin: -0.06
    }));
    mar.addChild(new Planet({
      name: '', orbit: 15 * s, radius: 2 * s, mass: 1 * m,
      color: [170, 150, 130], spot: [120, 105, 90], spin: 0.05, isMoon: true
    }));
    mar.addChild(new Planet({
      name: '', orbit: 24 * s, radius: 2.4 * s, mass: 1 * m,
      color: [160, 160, 170], spot: [110, 110, 120], spin: 0.03, isMoon: true
    }));

    let jupi = this.sun.addChild(new Planet({
      name: '유피', orbit: 275 * s, radius: 16 * s, mass: 130 * m,
      color: [220, 170, 110], spot: [190, 110, 70], spin: 0.08, ring: true
    }));
    jupi.addChild(new Planet({
      name: '', orbit: 32 * s, radius: 3 * s, mass: 2 * m,
      color: [230, 210, 120], spot: [190, 160, 60], spin: 0.04, isMoon: true
    }));
    jupi.addChild(new Planet({
      name: '', orbit: 44 * s, radius: 3.6 * s, mass: 3 * m,
      color: [200, 210, 220], spot: [150, 160, 175], spin: -0.03, isMoon: true
    }));
    jupi.addChild(new Planet({
      name: '', orbit: 52 * s, radius: 2.6 * s, mass: 2 * m,
      color: [160, 140, 120], spot: [110, 95, 80], spin: 0.02, isMoon: true
    }));

    let neo = this.sun.addChild(new Planet({
      name: '네오', orbit: 355 * s, radius: 11 * s, mass: 60 * m,
      color: [120, 200, 225], spot: [80, 150, 195], spin: -0.05
    }));
    neo.addChild(new Planet({
      name: '', orbit: 20 * s, radius: 2.6 * s, mass: 1.5 * m,
      color: [215, 225, 235], spot: [170, 180, 195], spin: 0.03, isMoon: true
    }));

    this.terra = terra;
    this.planets = this.sun.children; // 로켓 목적지 후보 (위성 제외)

    // 중력을 가진 모든 천체 (부모 → 자식 순서라 위치 계산이 꼬이지 않음)
    this.bodies = [];
    this.collect(this.sun);

    this.asteroids = [];
    this.rockets = [];
    this.debris = [];
    this.log = [];
  }

  // 테라에서 랜덤한 다른 행성으로 로켓 발사
  launchRocket() {
    let targets = this.planets.filter((p) => p !== this.terra);
    let target = random(targets);
    this.rockets.push(new Rocket(this.terra, target));
    this.addLog('테라 → ' + target.name + ' 발사');
  }

  addLog(msg) {
    this.log.unshift(msg);
    if (this.log.length > 5) this.log.pop();
  }

  explode(position, count, col) {
    for (let i = 0; i < count; i++) {
      this.debris.push(new Debris(position, position, null, col));
    }
  }

  collect(body) {
    this.bodies.push(body);
    for (let c of body.children) this.collect(c);
  }

  addAsteroid(a) {
    this.asteroids.push(a);
    if (this.asteroids.length > 200) this.asteroids.shift();
  }

  // 태양 둘레를 원 궤도로 돌 때의 속도
  orbitalVelocity(pos) {
    let r = p5.Vector.sub(pos, this.sun.position);
    let speed = sqrt((G * this.sun.mass) / max(r.mag(), this.sun.radius));
    return r.rotate(HALF_PI).setMag(speed);
  }

  run() {
    // 1) 천체 공전·자전
    for (let b of this.bodies) b.update();

    // 2) 소행성: 중력 → 이동 → 충돌 검사 (빠를 때도 정확하도록 두 번 나눠서 계산)
    const steps = 2;
    for (let k = 0; k < steps; k++) {
      for (let a of this.asteroids) {
        a.gravitate(this.bodies);
        a.update(1 / steps);
        let hit = a.collide(this.bodies);
        if (hit) this.impact(a, hit);
      }
    }

    // 3) 로켓: 중력 + 목적지로 향하는 추진력 → 이동 → 충돌/착륙 검사
    for (let k = 0; k < steps; k++) {
      for (let r of this.rockets) {
        if (r.state !== 'flying') continue;
        r.gravitate(this.bodies);
        r.steer(this.sun);
        if (r.dead) continue;
        r.update(1 / steps);
        r.check(this);
      }
    }
    for (let r of this.rockets) r.afterFrame();

    for (let a of this.asteroids) a.record();
    this.asteroids = this.asteroids.filter((a) => !a.dead && !a.isLost());
    this.rockets = this.rockets.filter((r) => !r.dead && !r.isLost());

    // 3) 그리기: 궤도 → 천체 → 소행성 → 파편
    for (let b of this.bodies) b.renderOrbit();
    for (let b of this.bodies) b.render(this.sun.position);
    for (let a of this.asteroids) a.render();
    for (let r of this.rockets) r.render();

    for (let i = this.debris.length - 1; i >= 0; i--) {
      let d = this.debris[i];
      d.run();
      if (d.isDead()) this.debris.splice(i, 1);
    }
  }

  // 소행성이 천체에 부딪혔을 때
  impact(asteroid, body) {
    asteroid.dead = true;
    body.flash = 1;
    let n = floor(asteroid.size * 3);
    for (let i = 0; i < n; i++) {
      this.debris.push(new Debris(asteroid.position, body.position, body));
    }
  }

  // 지금 이 속도로 던지면 어디로 갈지 미리 계산 (천체의 미래 위치까지 반영)
  predict(start, vel, frames) {
    let pos = start.copy();
    let v = vel.copy();
    let path = [];
    const steps = 2;
    for (let f = 1; f <= frames; f++) {
      for (let k = 0; k < steps; k++) {
        let t = f - 1 + k / steps;
        let acc = createVector(0, 0);
        let crashed = false;
        for (let b of this.bodies) {
          let bp = b.positionAt(t);
          let dir = p5.Vector.sub(bp, pos);
          let d = dir.mag();
          if (d < b.radius) crashed = true;
          let d2 = max(d * d, b.radius * b.radius);
          acc.add(dir.setMag((G * b.mass) / d2));
        }
        if (crashed) return path;
        v.add(acc.mult(1 / steps));
        pos.add(p5.Vector.mult(v, 1 / steps));
      }
      path.push(pos.copy());
    }
    return path;
  }
}

// ── 천체 (공전 + 자전) ─────────────────────────────

class CelestialBody {
  constructor(radius, mass) {
    this.radius = radius;
    this.mass = mass;
    this.parent = null;
    this.children = [];
    this.position = createVector(0, 0);

    this.orbitRadius = 0;
    this.orbitAngle = random(TWO_PI); // 공전 각도
    this.orbitSpeed = 0;              // 공전 각속도
    this.spinAngle = random(TWO_PI);  // 자전 각도
    this.spinSpeed = 0;               // 자전 각속도
    this.flash = 0;                   // 소행성에 맞았을 때 반짝임
  }

  addChild(child) {
    child.parent = this;
    // 케플러 법칙: 공전 각속도 = √(GM / r³) — 가까울수록 빨리 돕니다
    child.orbitSpeed = sqrt((G * this.mass) / pow(child.orbitRadius, 3));
    this.children.push(child);
    return child;
  }

  // f 프레임 뒤의 위치 (부모의 위치 + 공전 궤도 위 위치)
  positionAt(f) {
    if (!this.parent) return this.position.copy();
    let a = this.orbitAngle + this.orbitSpeed * f;
    let p = this.parent.positionAt(f);
    return p.add(cos(a) * this.orbitRadius, sin(a) * this.orbitRadius);
  }

  update() {
    this.orbitAngle += this.orbitSpeed; // 공전
    this.spinAngle += this.spinSpeed;   // 자전
    this.position = this.positionAt(0);
    this.flash *= 0.9;
  }

  renderOrbit() {
    if (!this.parent) return;
    noFill();
    stroke(255, this.isMoon ? 18 : 30);
    strokeWeight(1);
    circle(this.parent.position.x, this.parent.position.y, this.orbitRadius * 2);
  }
}

class Sun extends CelestialBody {
  constructor(x, y, radius, mass) {
    super(radius, mass);
    this.position = createVector(x, y);
    this.spinSpeed = 0.01;
    // 자전을 보여주는 흑점
    this.spots = [];
    for (let i = 0; i < 5; i++) {
      this.spots.push({ a: random(TWO_PI), d: random(0.2, 0.7), s: random(0.12, 0.22) });
    }
  }

  render() {
    let r = this.radius;
    push();
    translate(this.position.x, this.position.y);
    noStroke();
    // 빛 번짐
    for (let i = 6; i > 0; i--) {
      fill(255, 170, 60, 10);
      circle(0, 0, r * 2 + i * r * 0.5);
    }
    // 자전하는 빛줄기
    rotate(this.spinAngle);
    stroke(255, 200, 90, 70);
    strokeWeight(2);
    for (let i = 0; i < 12; i++) {
      let a = (TWO_PI / 12) * i;
      let len = r * (1.35 + 0.15 * sin(frameCount * 0.05 + i));
      line(cos(a) * r * 1.05, sin(a) * r * 1.05, cos(a) * len, sin(a) * len);
    }
    noStroke();
    fill(255, 190 + 40 * this.flash, 70);
    circle(0, 0, r * 2);
    fill(255, 230, 140);
    circle(0, 0, r * 1.5);
    // 흑점 (같이 돌아서 자전이 보임)
    fill(220, 120, 40, 170);
    for (let p of this.spots) {
      circle(cos(p.a) * p.d * r, sin(p.a) * p.d * r, p.s * r * 2);
    }
    pop();
  }
}

class Planet extends CelestialBody {
  constructor(opt) {
    super(opt.radius, opt.mass);
    this.name = opt.name;
    this.orbitRadius = opt.orbit;
    this.spinSpeed = opt.spin;
    this.col = color(...opt.color);
    this.spotCol = color(...opt.spot);
    this.ring = opt.ring || false;
    this.isMoon = opt.isMoon || false;

    // 표면 무늬 (자전하면서 같이 돕니다)
    this.spots = [];
    let n = this.isMoon ? 3 : 6;
    for (let i = 0; i < n; i++) {
      let s = random(0.15, 0.35);
      this.spots.push({ a: random(TWO_PI), d: random(0, 1 - s - 0.05), s: s });
    }
  }

  render(sunPos) {
    let r = this.radius;
    push();
    translate(this.position.x, this.position.y);

    // 고리 뒤쪽
    if (this.ring) this.drawRing(PI, TWO_PI);

    // 본체
    noStroke();
    fill(this.col);
    circle(0, 0, r * 2);

    // 자전하는 표면 무늬
    push();
    rotate(this.spinAngle);
    fill(this.spotCol);
    for (let p of this.spots) {
      circle(cos(p.a) * p.d * r, sin(p.a) * p.d * r, p.s * r * 2);
    }
    // 자전축 표시용 작은 점 (도는 게 더 잘 보이게)
    fill(255, 120);
    circle(r * 0.6, 0, max(1.5, r * 0.18));
    pop();

    // 밤 쪽 그림자 (항상 태양 반대편) — 자전과 상관없이 고정이라 입체감이 생김
    let toSun = atan2(sunPos.y - this.position.y, sunPos.x - this.position.x);
    fill(0, 0, 10, 160);
    arc(0, 0, r * 2 + 0.5, r * 2 + 0.5, toSun + HALF_PI, toSun + PI + HALF_PI);

    // 고리 앞쪽
    if (this.ring) this.drawRing(0, PI);

    // 맞았을 때 반짝임
    if (this.flash > 0.02) {
      noFill();
      stroke(255, 230, 180, 255 * this.flash);
      strokeWeight(2);
      circle(0, 0, r * 2 + (1 - this.flash) * r * 3);
    }
    pop();

    // 이름
    if (this.name) {
      noStroke();
      fill(200, 160);
      textAlign(CENTER, TOP);
      textSize(11);
      text(this.name, this.position.x, this.position.y + r + 6);
    }
  }

  drawRing(start, stop) {
    let r = this.radius;
    push();
    rotate(-0.35);
    noFill();
    stroke(230, 210, 170, 150);
    strokeWeight(r * 0.22);
    arc(0, 0, r * 4, r * 1.3, start, stop);
    stroke(200, 180, 140, 90);
    strokeWeight(r * 0.12);
    arc(0, 0, r * 3.3, r * 1.0, start, stop);
    pop();
  }
}

// ── 소행성 (Boid 와 같은 구조) ─────────────────────────

class Asteroid {
  constructor(x, y, vel) {
    this.acceleration = createVector(0, 0);
    this.velocity = vel.copy();
    this.position = createVector(x, y);
    this.size = random(3, 7) * system.s;
    this.angle = random(TWO_PI);
    this.spin = random(-0.08, 0.08); // 소행성도 빙글빙글 자전
    this.trail = [];
    this.dead = false;
    this.col = color(random(150, 200), random(130, 170), random(110, 140));

    // 울퉁불퉁한 모양
    this.shape = [];
    let n = 9;
    let seed = random(100);
    for (let i = 0; i < n; i++) {
      let a = (TWO_PI / n) * i;
      this.shape.push(map(noise(seed + cos(a), seed + sin(a)), 0, 1, 0.6, 1.3));
    }
  }

  applyForce(force) {
    // 질량을 넣는다면 A = F / M (여기선 소행성 질량 1)
    this.acceleration.add(force);
  }

  // 모든 천체의 중력: F = G·M / r²  (방향은 천체 쪽)
  gravitate(bodies) {
    for (let b of bodies) {
      let dir = p5.Vector.sub(b.position, this.position);
      let d2 = max(dir.magSq(), b.radius * b.radius); // 너무 가까울 때 힘이 폭발하지 않게
      dir.setMag((G * b.mass) / d2);
      this.applyForce(dir);
    }
  }

  update(dt) {
    this.velocity.add(this.acceleration.mult(dt));
    this.position.add(p5.Vector.mult(this.velocity, dt));
    this.acceleration.mult(0);
    this.angle += this.spin * dt;
  }

  record() {
    this.trail.push(this.position.copy());
    if (this.trail.length > 70) this.trail.shift();
  }

  collide(bodies) {
    for (let b of bodies) {
      if (p5.Vector.dist(this.position, b.position) < b.radius + this.size * 0.5) return b;
    }
    return null;
  }

  // 화면 밖으로 아주 멀리 날아가면 삭제
  isLost() {
    let m = max(width, height);
    return this.position.x < -m || this.position.x > width + m ||
           this.position.y < -m || this.position.y > height + m;
  }

  render() {
    // 꼬리
    noFill();
    for (let i = 1; i < this.trail.length; i++) {
      let a = map(i, 0, this.trail.length, 0, 120);
      stroke(255, 190, 120, a);
      strokeWeight(map(i, 0, this.trail.length, 0.5, this.size * 0.5));
      line(this.trail[i - 1].x, this.trail[i - 1].y, this.trail[i].x, this.trail[i].y);
    }
    // 몸체
    push();
    translate(this.position.x, this.position.y);
    rotate(this.angle);
    fill(this.col);
    stroke(90, 75, 60);
    strokeWeight(1);
    beginShape();
    for (let i = 0; i < this.shape.length; i++) {
      let a = (TWO_PI / this.shape.length) * i;
      vertex(cos(a) * this.size * this.shape[i], sin(a) * this.size * this.shape[i]);
    }
    endShape(CLOSE);
    pop();
  }
}

// 충돌 파편
class Debris {
  // origin 에서 바깥쪽으로 튀어나감. body 가 있으면 그 천체와 같이 이동
  constructor(position, origin, body, col) {
    this.position = position.copy();
    let out = p5.Vector.sub(position, origin);
    if (out.mag() < 0.001) out = p5.Vector.random2D();
    out.normalize();
    this.velocity = out.rotate(random(-1, 1)).mult(random(0.5, 2.5));
    if (body) this.velocity.add(p5.Vector.sub(body.positionAt(1), body.positionAt(0)));
    this.lifespan = 255;
    this.size = random(1, 3);
    this.col = col || null;
  }

  run() {
    this.position.add(this.velocity);
    this.velocity.mult(0.95);
    this.lifespan -= 7;
    noStroke();
    if (this.col) fill(red(this.col), green(this.col), blue(this.col), this.lifespan);
    else fill(255, random(150, 220), 90, this.lifespan);
    circle(this.position.x, this.position.y, this.size);
  }

  isDead() {
    return this.lifespan < 0;
  }
}

// ── 로켓 ─────────────────────────────────────────
// 테라의 공전 방향(순행)으로 발사 → 잠깐 관성 비행 → Boid 의 seek 처럼 목적지 행성을 향해 방향을 틂
// 중력은 소행성과 똑같이 받고, 태양에 너무 가까워지면 Boid 의 separate 처럼 피합니다.

class Rocket {
  constructor(home, target) {
    let s = system.s;
    this.home = home;
    this.target = target;

    // 순행 발사: 테라가 공전하는 방향으로, 테라의 공전 속도에 추진 속도를 더해서 출발
    let homeVel = p5.Vector.sub(home.positionAt(1), home.positionAt(0));
    let prograde = homeVel.copy().normalize();
    this.position = p5.Vector.add(home.position, p5.Vector.mult(prograde, home.radius + 4 * s));
    this.velocity = p5.Vector.add(homeVel, p5.Vector.mult(prograde, 1.8 * s));
    this.acceleration = createVector(0, 0);

    this.maxSpeed = 4.5 * s;
    this.maxForce = 0.12 * s;
    this.size = 7 * s;
    this.age = 0;
    this.thrust = 1;
    this.state = 'flying';   // flying → landing → (사라짐)
    this.dead = false;
    this.trail = [];
  }

  applyForce(force) {
    this.acceleration.add(force);
  }

  gravitate(bodies) {
    for (let b of bodies) {
      let dir = p5.Vector.sub(b.position, this.position);
      let d2 = max(dir.magSq(), b.radius * b.radius);
      dir.setMag((G * b.mass) / d2);
      this.applyForce(dir);
    }
  }

  // 목적지로 향하는 추진력 (Boid 의 seek: 원하는 속도 - 현재 속도)
  steer(sun) {
    // 연료는 한정 — 너무 오래 헤매면 실종 처리
    if (this.age > 1500) {
      this.crash(system, '연료 소진으로 실종');
      return;
    }
    // 발사 직후에는 순행 방향 그대로 관성 비행
    if (this.age < 30) {
      this.thrust = 1;
      return;
    }
    let s = system.s;
    let t = this.target;
    // 도착할 때쯤 행성이 있을 위치를 미리 겨냥
    let eta = min(p5.Vector.dist(this.position, t.position) / this.maxSpeed, 150);
    let aim = t.positionAt(eta);
    let targetVel = p5.Vector.sub(t.positionAt(1), t.positionAt(0));

    let safe = sun.radius * 3.2;
    let desired;

    // 목적지까지 직선이 태양을 스치면, 태양 옆을 돌아가는 경유지를 먼저 겨냥
    let detour = this.detour(aim, sun, safe);
    if (detour) {
      desired = p5.Vector.sub(detour, this.position).setMag(this.maxSpeed);
    } else {
      let toAim = p5.Vector.sub(aim, this.position);
      let d = toAim.mag();
      // 가까워지면 속도를 줄여서 살살 내려앉기 (arrive)
      let slowR = 110 * s;
      let speed = d < slowR ? map(d, 0, slowR, 0.6 * s, this.maxSpeed) : this.maxSpeed;
      desired = toAim.setMag(speed).add(targetVel);
    }

    let force = p5.Vector.sub(desired, this.velocity);
    force.limit(this.maxForce);
    this.applyForce(force);
    this.thrust = force.mag() / this.maxForce;

    // 태양에 너무 가까우면 밀어내기 (Boid 의 separate 처럼)
    let away = p5.Vector.sub(this.position, sun.position);
    let ds = away.mag();
    if (ds < safe) {
      away.setMag(this.maxForce * 3 * (1 - ds / safe) + (G * sun.mass) / (ds * ds));
      this.applyForce(away);
    }
  }

  // 지금 위치 → aim 직선이 태양 안전거리 안을 지나가면, 태양을 비켜 가는 경유지를 돌려줌
  detour(aim, sun, safe) {
    let seg = p5.Vector.sub(aim, this.position);
    let toSun = p5.Vector.sub(sun.position, this.position);
    let len2 = seg.magSq();
    if (len2 < 1) return null;
    let t = toSun.dot(seg) / len2;
    if (t <= 0 || t >= 1) return null;
    let closest = p5.Vector.add(this.position, p5.Vector.mult(seg, t));
    let side = p5.Vector.sub(closest, sun.position);
    if (side.mag() > safe * 1.2) return null;
    if (side.mag() < 0.001) side = seg.copy().rotate(HALF_PI);
    return p5.Vector.add(sun.position, side.setMag(safe * 1.7));
  }

  update(dt) {
    this.velocity.add(this.acceleration.mult(dt));
    this.velocity.limit(this.maxSpeed * 1.6);
    this.position.add(p5.Vector.mult(this.velocity, dt));
    this.acceleration.mult(0);
    this.age += dt;
  }

  // 충돌·착륙 검사
  check(sys) {
    // 소행성과 부딪히면 둘 다 폭발
    for (let a of sys.asteroids) {
      if (a.dead) continue;
      if (p5.Vector.dist(this.position, a.position) < a.size + this.size * 0.5) {
        a.dead = true;
        this.crash(sys, '소행성과 충돌');
        return;
      }
    }
    // 천체에 닿으면: 태양이면 타버리고, 행성·위성이면 착륙
    for (let b of sys.bodies) {
      if (b === this.home || b.parent === this.home) continue; // 출발한 테라와 그 위성은 지나가기만 함
      if (p5.Vector.dist(this.position, b.position) < b.radius + this.size * 0.3) {
        if (b === sys.sun) {
          this.crash(sys, '태양에 추락');
        } else {
          this.land(sys, b);
        }
        return;
      }
    }
  }

  crash(sys, why) {
    this.dead = true;
    this.state = 'crashed';
    sys.explode(this.position, 30, color(255, 160, 60));
    sys.explode(this.position, 12, color(230, 230, 240));
    sys.addLog('' + this.target.name + '행 로켓 — ' + why);
  }

  land(sys, body) {
    this.state = 'landing';
    this.landBody = body;
    this.landOffset = p5.Vector.sub(this.position, body.position).setMag(body.radius + this.size * 0.3);
    this.landTimer = 1;
    body.flash = 1;
    let where = body.name || (body.parent && body.parent.name ? body.parent.name + '의 위성' : '위성');
    let ok = body === this.target ? ' 착륙 성공' : '에 착륙 (목적지: ' + this.target.name + ')';
    sys.addLog('' + where + ok);
  }

  afterFrame() {
    if (this.state === 'flying') {
      this.trail.push(this.position.copy());
      if (this.trail.length > 90) this.trail.shift();
    } else if (this.state === 'landing') {
      // 착륙 지점에 붙어서 행성과 같이 움직이다가 작아지며 사라짐
      this.landTimer -= 0.025;
      this.position = p5.Vector.add(this.landBody.position, this.landOffset);
      if (this.trail.length) this.trail.shift();
      if (this.landTimer <= 0) this.dead = true;
    }
  }

  isLost() {
    let m = max(width, height) * 1.5;
    return this.position.x < -m || this.position.x > width + m ||
           this.position.y < -m || this.position.y > height + m;
  }

  render() {
    let s = system.s;
    // 비행 궤적
    noStroke();
    for (let i = 0; i < this.trail.length; i += 2) {
      fill(140, 210, 255, map(i, 0, this.trail.length, 10, 150));
      circle(this.trail[i].x, this.trail[i].y, 1.8);
    }

    let heading, scl;
    if (this.state === 'flying') {
      heading = this.velocity.heading();
      scl = 1;
      // 목적지 안내선
      stroke(140, 210, 255, 35);
      strokeWeight(1);
      drawingContext.setLineDash([4, 6]);
      line(this.position.x, this.position.y, this.target.position.x, this.target.position.y);
      drawingContext.setLineDash([]);
      noStroke();
      fill(170, 220, 255, 200);
      textAlign(LEFT, BOTTOM);
      textSize(10);
      text('→ ' + this.target.name, this.position.x + 8, this.position.y - 6);
    } else {
      heading = this.landOffset.heading(); // 착륙: 머리가 바깥을 향하게
      scl = this.landTimer;
    }

    push();
    translate(this.position.x, this.position.y);
    rotate(heading);
    scale(scl);
    let L = this.size;

    // 불꽃
    if (this.state === 'flying') {
      let f = L * (0.6 + this.thrust * 0.9) * random(0.8, 1.2);
      noStroke();
      fill(255, 140, 40, 200);
      triangle(-L * 0.5, -L * 0.22, -L * 0.5, L * 0.22, -L * 0.5 - f, 0);
      fill(255, 230, 120, 230);
      triangle(-L * 0.5, -L * 0.12, -L * 0.5, L * 0.12, -L * 0.5 - f * 0.55, 0);
    } else {
      // 착륙 중: 바닥에 먼지
      noStroke();
      fill(220, 220, 220, 120 * scl);
      ellipse(-L * 0.6, 0, L * 0.5, L * 1.6);
    }

    // 날개
    fill(220, 70, 70);
    triangle(-L * 0.5, -L * 0.25, -L * 0.15, -L * 0.25, -L * 0.6, -L * 0.55);
    triangle(-L * 0.5, L * 0.25, -L * 0.15, L * 0.25, -L * 0.6, L * 0.55);
    // 몸통
    fill(235, 238, 245);
    beginShape();
    vertex(L * 0.75, 0);
    vertex(L * 0.25, -L * 0.25);
    vertex(-L * 0.5, -L * 0.25);
    vertex(-L * 0.5, L * 0.25);
    vertex(L * 0.25, L * 0.25);
    endShape(CLOSE);
    // 창문
    fill(90, 170, 255);
    circle(L * 0.15, 0, L * 0.22);
    pop();
  }
}
