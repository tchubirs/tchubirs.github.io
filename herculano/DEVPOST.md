# Herculaneum: text for the Devpost submission

Paste each block into the Devpost field of the same name. The contest accepts
English only. Do not add brand names or logos.

## Project name

Herculaneum

## Elevator pitch (max 200 characters)

A scroll burnt by Vesuvius appears on your real table. Pull it open with a pinch, then sweep your palm over it to make the invisible ink glow, letter by letter. Hands only, seated.

## About the project

### Inspiration

In AD 79, Vesuvius buried a library at Herculaneum. Its papyrus scrolls
survived as lumps of carbon. They are too fragile to open, and their carbon ink
is almost invisible against the carbonised papyrus. In 2023, researchers read
the first word from inside a still-rolled scroll: ΠΟΡΦΥΡΑΣ, "purple". They
found it with machine learning on X-ray scans.

That discovery happened on screens. I wanted to let people feel it with their
own hands.

### What it does

1. **The scroll finds your table.** Scene understanding detects the real table
   in front of you, and the charred roll is laid on it, square to where you are
   looking. A guide hangs just behind it. If there is no table, or no
   passthrough, a wooden desk appears under the scroll.
2. **You open it with a pinch.** Pinch the roll and pull it to the right. The
   sheet unwinds as a true spiral, and the papyrus crackles as it opens.
3. **Your palm is the scanner.** The ink cannot be seen. Hold your open hand
   just above the papyrus and a cold disc of light follows your palm. Wherever
   it passes, Greek capitals glow gold and stay revealed. The lower your hand,
   the stronger the light.
4. **You find the word.** A card beside the scroll shows the word to look for,
   written as the scribe wrote it (for example ΗΔΟΝΩΝ). When you uncover it, a
   chord sounds, the word breathes, and its gloss rises above it: ἡδονῶν, "of
   pleasures", Epicurus, *Principal Doctrines* III.
5. **A new scroll every day.** The text is Epicurus, *Principal Doctrines* I–V.
   Each day's scroll hides a different word in a different place. The scroll
   remembers what you have read, and "Open another scroll" rolls it back up and
   brings the next one.

A session takes three to ten minutes. It starts cold in a few seconds, since
there are no models or sound files to load, and it can be dropped at any
moment.

### How I built it

* **WebXR with IWSDK** (Meta's Immersive Web SDK: Three.js plus an ECS),
  hosted as a static site. There is nothing to install.
* **The scroll is one custom shader.** A single 800 × 24 grid is bent in the
  vertex shader, using the turn radius at each point of the sheet, into a
  "carpet unroll": a flat part plus an Archimedean spiral that stays continuous
  where the two meet. Charred fibres and blistering are procedural noise.
* **The ink is text, not a picture.** Greek text from Usener's 1887 edition,
  which is in the public domain, is converted to scriptio continua (capitals,
  no accents, no spaces). It is laid out in columns on a canvas, and the layout
  never splits the target word across lines.
* **The reveal is a mask in sheet space.** Each frame, the palm's grip pose is
  projected into the sheet's (s, z) coordinates and stamps a disc into a
  512 × 96 mask. It stamps along the path between frames, so a fast sweep
  leaves a continuous trail. The hand holding the roll is ignored.
* **Scene understanding:** planes labelled table or desk are preferred. The
  scroll is clamped inside the table's bounds and follows you until you first
  touch it.
* **Sound** is synthesised with Web Audio (a scanner hum, a papyrus rustle and
  a chord), so there are no audio files.
* **Tests:** an end-to-end script drives the IWSDK emulator. It sits at a
  table, pinches, pulls, sweeps and checks every step: 12 checks, all passing.
  The demo video was recorded in the same emulator, one ECS step per video
  frame.

### Challenges I ran into

* Making the unrolled part and the spiral meet without a seam or a jump, while
  the roll's radius shrinks as it opens.
* A palm is not a point. The grip pose sits several centimetres from the wrist,
  so the reveal had to follow the palm itself, and the hand pulling the roll
  must not reveal anything.
* Letting someone who has never seen Greek capitals find a word. The museum
  card is the answer: you match shapes, not letters.

### Accomplishments I'm proud of

* It is one mechanic, and it is finished: hands only, seated, no controllers,
  and playable with a single hand (open first, then sweep).
* It falls back gracefully: a real table, then a virtual desk; AR, then VR.

### What I learned

The magic moment doesn't need assets. It comes from the response: light that
follows your hand, and ink that answers it.

### What's next

* More texts from the Herculaneum library (Philodemus), and harder hunts.
* A "museum mode" for classrooms and exhibitions.

### Target launch date

The web version is playable now at the link below. A Meta Horizon Store
release, packaged as a PWA, is planned for the first quarter of 2027.

## Built with

webxr, iwsdk, three.js, typescript, glsl, web-audio, scene-understanding, hand-tracking

## Try it out

(URL of the published app — filled in after publishing)

## Video

(YouTube or Vimeo link — public, under 3 minutes)

## Category and division

Entertainment & Gaming — New
