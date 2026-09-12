/**
 * Seed content: Cell Biology — built around the mitosis vs meiosis contrast pair.
 */
import { Concept, Question, Subject, Topic } from '../domain/types';
import { APP, C, card, E, KI, MC, SA, T } from './helpers';

export const BIO_SUBJECT: Subject = {
  id: 's-bio',
  name: 'Cell Biology',
  description: 'How cells work, divide, and pass on genetic information.',
  color: '#2E9E6B',
  icon: 'bio',
  createdAt: 0,
  updatedAt: 0,
};

export const BIO_TOPICS: Topic[] = [
  { id: 't-bio-basics', subjectId: 's-bio', name: 'Cell Basics', description: 'Cells and chromosomes.', order: 1, createdAt: 0, updatedAt: 0 },
  { id: 't-bio-division', subjectId: 's-bio', name: 'Cell Division', description: 'Mitosis and meiosis.', order: 2, createdAt: 0, updatedAt: 0 },
];

export const BIO_CONCEPTS: Concept[] = [
  C({
    id: 'c-bio-cell',
    subjectId: 's-bio',
    topicId: 't-bio-basics',
    name: 'Cell',
    intro: 'A cell is the smallest unit of life — a membrane-bound package containing the machinery to use energy, build molecules, and reproduce itself.',
    why: 'Every living thing is made of cells, and every biological process — growth, healing, inheritance, disease — happens inside cells or because of what cells do.',
    explanations: [
      E('analogy', 'eli5', 'A cell is like a [[workshop|small factory]]: it has walls (the membrane), a control room with the blueprints (the nucleus with DNA), power stations (mitochondria), and assembly lines (ribosomes). Everything needed to make more of itself is inside.'),
      E('simplified', 'eli5', 'A cell is the smallest thing that is alive. Your body is built from trillions of them.'),
      E('example', 'simple-example', 'A skin cell, a muscle cell, a bacterium — all cells: membrane outside, genetic material inside, machinery in between.'),
      E('steps', 'how-it-works', 'A living cell does three signature things: 1) takes in energy and raw materials, 2) builds and repairs its own parts using instructions in its DNA, 3) can eventually copy itself by dividing.'),
    ],
    terms: [
      T('membrane', 'The outer skin of the cell — controls what enters and leaves.', 'The cell’s wall with gates.', 'Like a fence with security doors.', 'The membrane is what makes “inside the cell” a real place.'),
      T('nucleus', 'The compartment holding the cell’s DNA in eukaryotic cells.', 'The control room with the blueprints.', 'The library where the master plans never leave.', 'Cell division starts with events in the nucleus.'),
    ],
    examples: {
      simple: 'One human skin cell under a microscope: a membrane blob with a dark nucleus.',
      realistic: 'A yeast cell budding: a small new cell growing off the parent before splitting away.',
      incorrect: 'A virus is NOT a cell — it has no membrane-bound machinery and cannot reproduce by itself.',
    },
    keyIdeas: [
      KI('smallest unit of life', ['smallest', 'basic unit', 'unit of life', 'smallest living']),
      KI('contains machinery and genetic material', ['membrane', 'dna', 'genetic', 'machinery', 'nucleus']),
      KI('can reproduce itself', ['divide', 'divide', 'reproduce', 'copy itself', 'replicate']),
    ],
    prerequisites: [],
    examWeight: 0.8,
    difficultyBase: 0.2,
  }),
  C({
    id: 'c-bio-chromosome',
    subjectId: 's-bio',
    topicId: 't-bio-basics',
    name: 'Chromosome',
    intro: 'A chromosome is a single long DNA molecule, tightly packaged with proteins, that carries a set of genes.',
    why: 'Cell division is fundamentally about chromosomes: copying them and distributing them correctly. When that fails, the new cells get the wrong instructions.',
    explanations: [
      E('analogy', 'eli5', 'If DNA is the [[book|instruction manual]] of life, a chromosome is one volume of the encyclopedia. Humans keep their library in 46 volumes. Before a cell divides, every volume is photocopied — and each new cell must get exactly one copy of each volume.'),
      E('simplified', 'eli5', 'A chromosome is a packaged strand of DNA. You have 46 of them. They get copied and sorted carefully whenever a cell divides.'),
      E('example', 'simple-example', 'Human body cells have 46 chromosomes (23 pairs — one of each pair from each parent). Sperm and egg cells have 23 single chromosomes.'),
      E('steps', 'how-it-works', 'Before division: 1) The DNA is copied, so each chromosome now has two identical sister chromatids joined at a centromere. 2) During division, the spindle fibers pull the sister chromatids apart. 3) Each new cell receives one chromatid from every chromosome — a complete set.'),
    ],
    terms: [
      T('chromatid', 'One of the two identical copies of a replicated chromosome.', 'One of the two twin halves after copying.', 'An X shape under the microscope is two chromatids joined.', 'Chromatids are what gets pulled apart during division.'),
      T('gene', 'A stretch of DNA carrying instructions for one trait or protein.', 'One recipe inside the book.', 'The gene for eye color sits on a specific chromosome.', 'Genes live on chromosomes — that’s why chromosome distribution matters.'),
      T('homologous pair', 'Two chromosomes carrying the same gene set, one from each parent.', 'The matching pair — one from mom, one from dad.', 'Chromosome 7 from your mother and chromosome 7 from your father.', 'Meiosis deliberately separates homologous pairs.'),
    ],
    examples: {
      simple: '46 chromosomes in your body cells: 23 from your mother, 23 from your father.',
      realistic: 'Down syndrome arises when a child receives three copies of chromosome 21 — a chromosome-sorting error in meiosis.',
      incorrect: '“Chromosome and gene are the same.” A gene is one instruction on a chromosome; the chromosome is the whole volume.',
    },
    keyIdeas: [
      KI('packaged DNA', ['dna', 'packaged', 'dna molecule', 'strand']),
      KI('copied before division', ['copied', 'replicated', 'copy', 'duplicate']),
      KI('distributed to new cells', ['distributed', 'sorted', 'separated', 'pull', 'each new cell']),
    ],
    prerequisites: ['c-bio-cell'],
    examWeight: 0.9,
    difficultyBase: 0.35,
  }),
  C({
    id: 'c-bio-cell-division',
    subjectId: 's-bio',
    topicId: 't-bio-division',
    name: 'Cell Division',
    intro: 'Cell division is the process by which one cell becomes two — the copied chromosomes are sorted and the cell contents split.',
    why: 'Growth, healing, and reproduction all run on cell division. The two variants — mitosis and meiosis — have very different jobs, and confusing them is one of the most common exam errors.',
    explanations: [
      E('simplified', 'eli5', 'Cell division is how a cell makes more cells: copy the instructions, sort them into two equal piles, then pinch the cell in two.'),
      E('analogy', 'eli5', 'Like [[moving out|founding a second household]]: you photocopy every book in your library, put one copy of each into two identical boxes, and one box leaves with the new household. The library never gives away originals.'),
      E('example', 'simple-example', 'A skin cell divides: 46 chromosomes are copied, and each daughter cell receives the full 46 — two genetically identical skin cells.'),
      E('steps', 'how-it-works', 'Common skeleton of division: 1) DNA is copied. 2) The copies are aligned and pulled apart by spindle fibers. 3) The cell splits its cytoplasm. Mitosis and meiosis differ in how many sorting rounds happen and what gets sorted (sister chromatids vs homologous pairs).'),
    ],
    terms: [
      T('daughter cell', 'The two new cells produced by division.', 'The two resulting cells.', 'Each division yields two daughter cells.', '“Daughter” just means product of division.'),
      T('spindle', 'The fiber structure that grabs and pulls chromosomes apart.', 'The ropes doing the pulling.', 'Like puppet strings attached to each chromatid.', 'The spindle decides what lands in each daughter cell.'),
    ],
    examples: {
      simple: 'One bacterium divides into two identical bacteria.',
      realistic: 'A cut heals because nearby cells divide repeatedly to fill the gap — by mitosis.',
      incorrect: '“Cell division always makes identical cells.” Mitosis does; meiosis does not — it halves the chromosome number and shuffles genes.',
    },
    keyIdeas: [
      KI('one cell becomes two', ['one cell', 'two', 'two cells', 'splits', 'pinch', 'divide']),
      KI('chromosomes copied and sorted', ['copied', 'sorted', 'copied and sorted', 'chromosomes']),
    ],
    prerequisites: ['c-bio-chromosome'],
    examWeight: 0.85,
    difficultyBase: 0.35,
  }),
  C({
    id: 'c-bio-gamete',
    subjectId: 's-bio',
    topicId: 't-bio-division',
    name: 'Gamete',
    intro: 'A gamete is a sex cell — sperm or egg — carrying HALF the species’ chromosome number, so that fertilization restores the full set.',
    why: 'Gametes are the reason meiosis exists: if sex cells carried the full chromosome count, each generation would double it. Halving is not a detail — it is the whole design.',
    explanations: [
      E('analogy', 'eli5', 'A [[book set|46-volume encyclopedia]] can’t be passed on by giving each child a full copy from EACH parent — the child would have 92 volumes. So each parent packs a half-set (23 volumes) into a gamete, and the child’s two half-sets make one full library.'),
      E('simplified', 'eli5', 'A gamete is a sperm or egg cell. It has only 23 chromosomes — half. When sperm meets egg, 23 + 23 = 46.'),
      E('example', 'simple-example', 'Human sperm: 23 chromosomes. Human egg: 23 chromosomes. Fertilized egg: 46 — a complete new individual’s set.'),
    ],
    terms: [
      T('haploid', 'Having one set of chromosomes (n) — half the full number.', 'Half-set.', 'Gametes are haploid (23 in humans).', 'The haploid/diploid distinction is exactly what meiosis manages.'),
      T('diploid', 'Having two sets of chromosomes (2n) — one from each parent.', 'Full paired set.', 'Body cells are diploid (46 in humans).', 'Meiosis turns diploid into haploid; fertilization turns haploid back into diploid.'),
      T('fertilization', 'The fusion of two gametes into one new cell.', 'Sperm meets egg.', '23 + 23 = 46.', 'Fertilization is why gametes must be haploid.'),
    ],
    examples: {
      simple: 'Sperm (23) + egg (23) → zygote (46).',
      realistic: 'A horse (64 chromosomes) and a donkey (62) produce a mule with 63 — the odd number from mismatched pairs is why mules are usually sterile.',
      incorrect: '“Gametes are produced by mitosis.” In animals, gametes come from meiosis — mitosis would hand on the full 46.',
    },
    keyIdeas: [
      KI('sex cell (sperm or egg)', ['sperm', 'egg', 'sex cell', 'sex cells']),
      KI('half the chromosomes', ['half', '23', 'haploid', 'half the']),
      KI('fertilization restores full set', ['fertiliz', 'restore', '23 + 23', 'full set', '46']),
    ],
    prerequisites: ['c-bio-cell'],
    examWeight: 0.8,
    difficultyBase: 0.35,
  }),
  C({
    id: 'c-bio-mitosis',
    subjectId: 's-bio',
    topicId: 't-bio-division',
    name: 'Mitosis',
    intro: 'Mitosis is cell division for growth and repair: one diploid cell produces two genetically identical diploid cells.',
    why: 'Nearly all the cells in your body — skin, blood, muscle — come from mitosis and are replaced by mitosis. Its job is faithful copying, not diversity.',
    explanations: [
      E('analogy', 'eli5', 'Mitosis is a [[photocopier|perfect photocopy]]: one cell, 46 chromosomes, is copied and split into two cells that each have exactly the same 46. Growth and healing need copies, not surprises.'),
      E('simplified', 'eli5', 'Mitosis makes two identical cells with the full chromosome number. It is for growing and repairing the body.'),
      E('example', 'simple-example', 'One skin cell with 46 chromosomes divides → two skin cells, each with the same 46. Identical twins also start from one embryo split — same DNA, which is why they match.'),
      E('comparison', 'how-it-works', 'Mitosis vs [[meiosis|Meiosis]] in one glance:\n  • Rounds of division: 1 vs 2\n  • Daughter cells: 2 vs 4\n  • Chromosome number: stays 2n vs halved to n\n  • Genetic identity: identical vs shuffled (crossing over)\n  • Job: growth & repair vs making gametes\nSame opening act (copy the DNA); completely different endings.'),
      E('steps', 'how-it-works', 'Mitosis in order: 1) Chromosomes copy (sister chromatids form). 2) Chromosomes line up single-file. 3) Spindle pulls sister chromatids apart — one to each side. 4) Two nuclei form; the cell pinches in two. Result: 2 identical diploid cells.'),
    ],
    terms: [
      T('diploid (2n)', 'Two complete sets of chromosomes — the body-cell state.', 'Full paired set.', '46 in humans.', 'Mitosis preserves diploid; meiosis halves it.'),
    ],
    examples: {
      simple: 'A scraped knee heals: skin cells divide by mitosis, filling the wound with exact copies.',
      realistic: 'Intestinal lining cells replace themselves every few days by mitosis — relentless faithful copying.',
      counter: 'Mitosis never produces sperm or eggs in animals — that is meiosis’s job.',
      incorrect: '“Mitosis creates genetic diversity.” It creates copies; diversity comes from meiosis (crossing over + random sorting).',
    },
    keyIdeas: [
      KI('two identical cells', ['identical', 'two identical', 'same', 'copies', 'clone']),
      KI('full chromosome number kept', ['full', '46', 'diploid', '2n', 'same number', 'stays']),
      KI('for growth and repair', ['growth', 'grow', 'repair', 'heal', 'replace', 'healing']),
      KI('one division round', ['one division', 'single division', 'one round']),
    ],
    prerequisites: ['c-bio-cell-division'],
    misconceptions: [
      {
        label: 'Mitosis produces gametes',
        wrongIdea: 'Mitosis is how sperm and egg cells are made.',
        whyPlausible: 'Both are “cell division”, and mitosis is taught first — so it becomes the default answer for any division question.',
        whereItBreaks: 'Gametes must be haploid (23). Mitosis preserves the full set (46) — a sperm made by mitosis would create a 92-chromosome child after fertilization.',
        correction: 'Gametes are produced by meiosis. Mitosis makes identical body cells for growth and repair.',
        contrast: {
          wrong: '“Sperm are made when the testis cells divide by mitosis.”',
          correct: '“Sperm are made by meiosis; mitosis only multiplies the precursor cells.”',
        },
        targetedExample: 'Follow the chromosome count: a mitosis product of a 46-chromosome cell has 46. A sperm has 23. So mitosis cannot be the last step in making sperm.',
        detectPatterns: ['mitosis produces gametes', 'mitosis makes gametes', 'mitosis creates sperm', 'mitosis creates eggs', 'gametes by mitosis', 'sperm are made by mitosis', 'eggs are made by mitosis', 'mitosis makes sperm', 'mitosis produces sperm', 'mitosis produces eggs'],
        checkQuestionIds: ['q-bio-mito-gametes'],
      },
    ],
    examWeight: 1.0,
    difficultyBase: 0.4,
  }),
  C({
    id: 'c-bio-meiosis',
    subjectId: 's-bio',
    topicId: 't-bio-division',
    name: 'Meiosis',
    intro: 'Meiosis is cell division for sexual reproduction: one diploid cell produces four genetically DIFFERENT haploid cells — gametes.',
    why: 'Meiosis is the engine of genetic diversity and the guardian of chromosome number across generations. It halves the count and shuffles the deck — both essential for how inheritance works.',
    explanations: [
      E('analogy', 'eli5', 'Meiosis is like dealing a [[card game|card deck]] into half-size hands. You have 46 cards (23 pairs). First, matching cards swap tips (crossing over — new combinations). Then the deck is dealt twice: first the pairs are split (23 to each hand), then each hand splits into single cards. Four hands, each different, each with 23.'),
      E('simplified', 'eli5', 'Meiosis makes sex cells: four cells with half the chromosomes, and each one is genetically different.'),
      E('comparison', 'how-it-works', 'Meiosis vs [[mitosis|Mitosis]] in one glance:\n  • Rounds of division: 2 vs 1\n  • Daughter cells: 4 vs 2\n  • Chromosome number: halved (n) vs kept (2n)\n  • Genetic identity: all different vs identical\n  • Crossing over: yes vs no\n  • Job: gametes vs growth & repair'),
      E('steps', 'how-it-works', 'Meiosis in order: 1) Chromosomes copy. 2) Homologous pairs pair up and swap segments — crossing over. 3) First division: homologous pairs separate (chromosome number halves). 4) Second division: sister chromatids separate. Result: 4 haploid, genetically unique cells.'),
      E('example', 'simple-example', 'One cell in an ovary (46) → meiosis → one egg + polar bodies (23 each). One cell in a testis → four sperm (23 each). Fertilization: 23 + 23 = 46, a brand-new combination.'),
    ],
    terms: [
      T('crossing over', 'Homologous chromosomes exchange segments during meiosis I.', 'Matching chromosomes swap pieces.', 'Chromosome 7 from mom trades a segment with chromosome 7 from dad.', 'Crossing over is the #1 source of new gene combinations.'),
      T('independent assortment', 'Each homologous pair is distributed independently of the others — random sorting.', 'Each pair is dealt randomly.', 'Which chromosome 7 you get says nothing about which chromosome 11 you get.', 'With 23 pairs this alone yields 8+ million combinations.'),
    ],
    examples: {
      simple: 'One diploid cell → four haploid gametes, each genetically unique.',
      realistic: 'Siblings are so different because each got a different reshuffled half-set from each parent — meiosis deals a new hand every time.',
      counter: 'Meiosis does NOT keep the chromosome number — halving is its whole point.',
      edge: 'Meiosis errors (non-disjunction) produce gametes with extra or missing chromosomes — e.g., trisomy 21.',
      incorrect: '“Meiosis is just mitosis happening twice.” The two divisions differ in kind: meiosis I separates homologous pairs (mitosis never does this); only meiosis II resembles mitosis.',
    },
    keyIdeas: [
      KI('four haploid cells', ['four', '4', 'haploid', 'half', '23', 'gametes', 'sex cells']),
      KI('genetically different', ['different', 'diverse', 'unique', 'diversity', 'variation', 'shuffl', 'crossing over', 'recombin']),
      KI('two division rounds', ['two divisions', 'two rounds', 'meiosis i and meiosis ii', 'twice', 'two rounds of division']),
      KI('makes gametes', ['gamete', 'gametes', 'sperm', 'egg', 'sex cells', 'reproduction']),
    ],
    prerequisites: ['c-bio-cell-division', 'c-bio-gamete'],
    misconceptions: [
      {
        label: 'Meiosis is just mitosis twice',
        wrongIdea: 'Meiosis is simply two consecutive mitotic divisions.',
        whyPlausible: 'Both involve copied chromosomes and spindle machinery, and meiosis II looks like mitosis — so “mitosis ×2” feels like a safe summary.',
        whereItBreaks: 'Mitosis never separates homologous pairs and never halves chromosome number. Meiosis I separates homologous pairs (and triggers crossing over) — an event mitosis simply does not have. Without meiosis I, the count never halves.',
        correction: 'Meiosis I is unique (pairs separate, crossing over, number halves); meiosis II resembles mitosis (chromatids separate). It is not “mitosis twice”.',
        contrast: {
          wrong: '“Meiosis = mitosis, then mitosis again.”',
          correct: '“Meiosis I separates homologous pairs — nothing like mitosis; meiosis II separates chromatids — like mitosis.”',
        },
        targetedExample: 'Track the count: mitosis keeps 46→46. Two mitoses in a row: 46→46→46 — never 23. Only meiosis I’s pair-separation can produce the halving.',
        detectPatterns: ['just mitosis twice', 'mitosis twice', 'two mitoses', 'same as mitosis twice', 'mitosis two times', 'mitosis repeated'],
        checkQuestionIds: ['q-bio-meio-twice'],
      },
      {
        label: 'Crossing over happens in mitosis',
        wrongIdea: 'Crossing over (segment swapping) occurs during mitosis too.',
        whyPlausible: 'Crossing over is strongly associated with “the chromosomes pair up” — and chromosomes do visibly condense in mitosis too.',
        whereItBreaks: 'In mitosis, homologous chromosomes never pair up. Crossing over requires homologs to align side by side — that pairing only happens in meiosis I (prophase I).',
        correction: 'Crossing over happens only in prophase I of meiosis, when homologous pairs physically pair and recombine.',
        contrast: {
          wrong: '“In mitosis, chromosomes swap segments as they line up.”',
          correct: '“In mitosis, homologs never pair; in meiosis I, they must — and that is when crossing over occurs.”',
        },
        targetedExample: 'Geneticists deliberately induce mitotic crossing over in the lab as a special technique — precisely because it never happens naturally.',
        detectPatterns: ['crossing over in mitosis', 'crossing over during mitosis', 'mitosis crossing over', 'cross over in mitosis', 'recombination in mitosis'],
        checkQuestionIds: ['q-bio-meio-xover'],
      },
    ],
    examWeight: 1.0,
    difficultyBase: 0.5,
  }),
];

export const BIO_QUESTIONS: Question[] = [
  MC('q-bio-cell-guided', 'c-bio-cell', 'What is a cell?', ['A molecule inside blood', 'The smallest unit of life', 'A part of an atom', 'A type of protein'], { correctIndex: 1, difficultyBase: 0.15 }),
  MC('q-bio-chromo-guided', 'c-bio-chromosome', 'How many chromosomes are in a typical human body cell?', ['23', '46', '92', '12'], { correctIndex: 1, difficultyBase: 0.25 }),
  MC('q-bio-gamete-guided', 'c-bio-gamete', 'How many chromosomes does a human sperm cell carry?', ['46, like all cells', '23 — half the full set', '92, double', 'It varies by person'], { correctIndex: 1, difficultyBase: 0.3 }),
  SA('q-bio-gamete-why', 'c-bio-gamete', 'Why must gametes have only half the species’ chromosome number?', 'so fertilization (two halves) restores the full number each generation', [['fertiliz', 'combine', 'two halves', 'restore', '23 + 23', 'full number', 'full set', 'doubl']], { difficultyBase: 0.4 }),

  MC('q-bio-mito-guided', 'c-bio-mitosis', 'What does mitosis produce?', ['Four haploid gametes', 'Two genetically identical diploid cells', 'Two different haploid cells', 'One giant cell'], { correctIndex: 1, difficultyBase: 0.3 }),
  MC('q-bio-mito-job', 'c-bio-mitosis', 'A cut on your hand heals. Which process replaced the skin cells?', [{ text: 'Meiosis', conceptId: 'c-bio-meiosis' }, 'Mitosis', 'Fertilization', 'Photosynthesis'], { correctIndex: 1, difficultyBase: 0.3 }),
  MC('q-bio-mito-gametes', 'c-bio-mitosis', 'Which cells does mitosis produce?', ['Body cells for growth and repair — never gametes', { text: 'Sperm and egg cells', misconceptionId: 'md_c-bio-mitosis_mitosis-produces-gametes' }, 'Both, depending on the organ', 'Red blood cells only'], { correctIndex: 0, difficultyBase: 0.35, targetsMisconception: 'md_c-bio-mitosis_mitosis-produces-gametes', hints: ['If a sperm (23) came from mitosis of a 46-cell, how many chromosomes would it have?', 'Mitosis preserves the chromosome number. Gametes need half.', 'Gametes are made by meiosis; mitosis makes identical body cells.'] }),
  SA('q-bio-mito-explain', 'c-bio-mitosis', 'In your own words: what is mitosis for, and what does it produce?', 'growth and repair; two identical diploid cells', [['growth', 'grow', 'repair', 'heal', 'replace'], ['identical', 'same', 'copies', 'two'], ['diploid', 'full', '46', 'same number']], { difficultyBase: 0.4 }),

  MC('q-bio-meio-guided', 'c-bio-meiosis', 'What does meiosis produce?', ['Two identical diploid cells', 'Four genetically different haploid gametes', 'Four identical diploid cells', 'Two haploid identical cells'], { correctIndex: 1, difficultyBase: 0.35 }),
  MC('q-bio-meio-twice', 'c-bio-meiosis', '“Meiosis is just mitosis happening twice.” What is wrong with that?', ['Nothing — that is accurate', { text: 'Nothing — both divisions in meiosis are mitotic', misconceptionId: 'md_c-bio-meiosis_meiosis-is-just-mitosis-twice' }, 'Meiosis I separates homologous pairs (halving the number) — something mitosis never does; only meiosis II resembles mitosis', 'Mitosis happens only once in meiosis and meiosis three times'], { correctIndex: 2, difficultyBase: 0.5, targetsMisconception: 'md_c-bio-meiosis_meiosis-is-just-mitosis-twice', hints: ['In mitosis, do homologous pairs ever separate?', 'Which division actually halves the chromosome number?', 'Meiosis I separates pairs — mitosis never does that.'] }),
  MC('q-bio-meio-xover', 'c-bio-meiosis', 'When does crossing over occur?', ['During mitosis, when chromosomes condense', { text: 'During mitosis as well as meiosis', misconceptionId: 'md_c-bio-meiosis_crossing-over-happens-in-mitosis' }, 'During prophase I of meiosis, when homologous pairs align', 'After fertilization'], { correctIndex: 2, difficultyBase: 0.45, targetsMisconception: 'md_c-bio-meiosis_crossing-over-happens-in-mitosis', hints: ['Crossing over needs homologous chromosomes side by side. When do they actually pair?', 'Homolog pairing happens only in meiosis I.'] }),
  APP('q-bio-meio-apply', 'c-bio-meiosis', 'Scenario: a rare lab error makes meiosis skip its FIRST division (pairs never separate), but the second division runs normally. Describe the resulting gametes.', 'gametes with the full chromosome number (unreduced) — after fertilization the count would double', [['full', 'unreduced', '46', 'not halved', 'doubled', 'diploid'], ['first division', 'pairs', 'meiosis i']], { difficultyBase: 0.6 }),

  // contrastive comparison questions (req 12)
  SA('q-bio-compare-mm', 'c-bio-mitosis', 'Contrast: mitosis vs meiosis — what makes them different, and what would break if your body used meiosis to heal wounds?', 'mitosis makes identical copies for repair; meiosis halves and shuffles — healing would produce half-chromosome, mismatched cells', [['identical', 'copies', 'same'], ['half', 'haploid', 'shuffle', 'different', 'diverse'], ['wound', 'heal', 'repair', 'break', 'half-chromosome', 'mismatched', 'wrong']], { difficultyBase: 0.55, compareWith: 'c-bio-meiosis', cognitiveLevel: 'comparison' }),
  SA('q-bio-compare-mm2', 'c-bio-meiosis', 'If gametes were produced by mitosis instead of meiosis, what would happen to the chromosome number across generations?', 'the chromosome number would double every generation', [['double', 'doubles', '92', 'twice', 'increase', 'add up', 'sum', 'doubles every']], { difficultyBase: 0.5, compareWith: 'c-bio-mitosis', cognitiveLevel: 'comparison' }),
];

export const BIO_CARDS = [
  card('c-bio-mitosis', 'Mitosis produces…', '2 identical diploid cells — growth and repair.'),
  card('c-bio-meiosis', 'Meiosis produces…', '4 genetically different haploid gametes — sexual reproduction.'),
  card('c-bio-chromosome', 'Human chromosome counts', 'Body cells: 46 (23 pairs). Gametes: 23.'),
  card('c-bio-gamete', 'Why are gametes haploid?', 'So fertilization restores the full number: 23 + 23 = 46.'),
];
