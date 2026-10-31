# Figure style

This is the single source for how unit figures look. Every concept prompt, edit request, agent brief and
review checks against this file. Prompts describe the figure in plain measurements and materials only.

## Never use these words in a prompt

chibi, MGSD, SD, super-deformed, Master Grade SD, Gundam, Nendoroid, cute, kawaii, toy, cartoony, stubby,
tiny legs. Not in Gemini prompts, edit requests, prompt templates, spec "Figures" tables or agent briefs.
These labels pushed the image model to big-eyed, baby-faced figures that the owner rejected.

## Look

Serious and highly detailed, like a premium painted miniature or a high-end plastic model kit: crisp
hard-surface panel lines, trim and texture, a realistic paint finish. No big cartoon eyes, baby faces or
rounded novelty styling. Original designs only: no Games Workshop logos, sculpt copies or iconography.

## Proportions

Master reference (owner, 2026-10-31): `docs/figure-style-reference.jpg` (also in the Hunyuan folder as
`refs/figure-style-reference.jpg`), an armoured trooper in a black coat with a radio. Second approved
reference: `Hunyuan3D-2/refs/librarian.webp` (bulkier, head about 1/4 of height). Measured on the master:

- Total height: about 2.8 head-heights (top of helmet to soles; range 2.8 to 3.5 with the librarian).
- Head or helmet: about 35% of total height; about 0.55 of the shoulder span wide.
- Shoulders: very broad, about 1.8 times the head's width, with heavy pauldrons.
- Torso: chin to belt about 0.75 of a head; deep, armoured chest.
- Hips to soles: about one head. Legs are short and thick, partly hidden by armour or a coat skirt.
- Feet: big boots, each about 0.6 of the head's width long, set in a wide planted stance.
- Hands: gloved fists about 1/3 of the head's height; weapons oversized (the gun is as long as the head is wide).
- Face: covered or stern (helmet, visor, respirator, hood or a serious sculpted face), never big round eyes.
- Finish: matte realistic paint, edge highlights, rivets, straps, pouches and panel lines.

What went wrong before: the head ratio of the rejected figures was similar (about 40%), but they had big
round eyes, soft rounded shapes, narrow shoulders and glossy novelty-style paint. The heavy armour, broad
shoulders, covered or stern face and matte detail are what make this style.

Prompt phrasing that describes this without labels, for example: "a highly detailed painted miniature
figure of <unit>, about 2.8 head-heights tall: a large helmeted head about a third of its height, very
broad armoured shoulders almost twice the head's width, a deep armoured chest, short thick legs about one
head long with big boots in a wide stance, gloved hands and an oversized weapon, stern covered face, crisp
panel lines and rivets, matte realistic paint with edge highlights, standing on a plain black round base,
white background, full figure, no text". Attach `figure-style-reference.jpg` to the first Gemini message of
each army chat and ask it to match those proportions and that finish.

## Approved (locked in 2026-10-31)

The owner approved this style: "Lock it in. Those are way better." The five approved test figures are in
Mallet 42k `art/unit-concepts/style-tests/` (01-marine, 02-ork, 03-necron, 04-genestealer, 05-guardian and
`contact.png`, which shows them beside the reference). Every new figure, and every regenerated older
figure in both games, matches them.

Recipe that produced them: Gemini (3.1 Pro) in the owner's Windows Chrome, one chat per army, with
`figure-style-reference.jpg` attached to the first message. First prompt:

> Create an image. Match this figure's proportions, materials and paint finish exactly, but make a
> different unit: a highly detailed painted miniature figure of <unit, colours, weapon>, about 2.8
> head-heights tall: a large helmeted head about a third of its height, very broad armoured shoulders
> almost twice the head's width with heavy rounded pauldrons, a deep armoured chest (chin to belt about
> three quarters of a head), short thick legs about one head long with big boots in a wide planted stance,
> gloved fists about a third of the head's height, an oversized <weapon>, stern covered face behind a
> helmet with a dark visor, crisp panel lines, rivets, straps and pouches, matte realistic paint with edge
> highlights, standing on a plain black round base, white background, full figure in view, no text, no
> logos or emblems on the armour.

Later units: a fresh request in the same chat that again says "same proportions and finish as the
reference photo". Adapt the face line to the unit (a sculpted stern face, hood or mask instead of a visor
where that fits). Measure every result: creatures and tall helmets drift towards a too-big head (the
Genestealer test came back at about 50% of its height, the Guardian at 41%); redo those with a corrective
note.

## Review

Judge the image, not the prompt: proportions against the reference, the serious detailed look, and the
usual artifact checks (extra or missing weapons or limbs, text on the model, cropped figure or base).
