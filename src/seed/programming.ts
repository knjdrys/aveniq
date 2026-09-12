/**
 * Seed content: Programming Foundations — includes class vs object and encapsulation
 * (the spec's vocabulary-decoder example).
 */
import { Concept, Question, Subject, Topic } from '../domain/types';
import { APP, C, card, E, KI, MC, SA, T } from './helpers';

export const PRG_SUBJECT: Subject = {
  id: 's-prg',
  name: 'Programming Foundations',
  description: 'Variables, functions, objects, and classes — how code is organized.',
  color: '#B45CC4',
  icon: 'code',
  createdAt: 0,
  updatedAt: 0,
};

export const PRG_TOPICS: Topic[] = [
  { id: 't-prg-basics', subjectId: 's-prg', name: 'Basics', description: 'Variables, functions, loops.', order: 1, createdAt: 0, updatedAt: 0 },
  { id: 't-prg-objects', subjectId: 's-prg', name: 'Objects & Classes', description: 'Grouping data with behavior.', order: 2, createdAt: 0, updatedAt: 0 },
];

export const PRG_CONCEPTS: Concept[] = [
  C({
    id: 'c-prg-variable',
    subjectId: 's-prg',
    topicId: 't-prg-basics',
    name: 'Variable',
    intro: 'A variable is a named box in memory that stores one value you can read and replace while the program runs.',
    why: 'Programs manipulate changing information. Variables are the handles that let code refer to “the current value” without knowing it in advance.',
    explanations: [
      E('analogy', 'eli5', 'A variable is a [[labeled jar|labeled jar]]: the label is the name, the inside holds one thing at a time, and you may swap the contents — but only one thing fits at once.'),
      E('simplified', 'eli5', 'A variable is a named place to store a value. The value can change; the name stays.'),
      E('example', 'simple-example', 'score = 0 … later … score = 10. The name “score” always fetches the latest stored value.'),
      E('steps', 'how-it-works', 'What happens on `score = 10`: 1) Memory is reserved for the variable. 2) The value 10 is written there. 3) From now on, every read of `score` returns 10 — until another assignment replaces it.'),
    ],
    terms: [
      T('assignment', 'The act of storing a value into a variable.', 'Putting something in the jar.', 'x = 5 assigns 5 to x.', 'Assignment is how variables change.'),
      T('value', 'The actual data stored — a number, text, true/false.', 'The thing inside the jar.', 'The value of x after `x = 5` is 5.', 'Programs compute by transforming values.'),
    ],
    examples: {
      simple: 'lives = 3; when the player is hit: lives = 2.',
      realistic: 'A cart app: total = sum of line prices; recalculated as items change.',
      incorrect: '“A variable is its value.” No — the variable is the container; the value is its current content. Two variables can hold equal values and still be different variables.',
    },
    keyIdeas: [
      KI('named storage', ['name', 'named', 'label', 'called']),
      KI('value can change', ['change', 'replace', 'reassign', 'update']),
    ],
    prerequisites: [],
    examWeight: 0.8,
    difficultyBase: 0.15,
  }),
  C({
    id: 'c-prg-function',
    subjectId: 's-prg',
    topicId: 't-prg-basics',
    name: 'Function',
    intro: 'A function is a named, reusable block of code that takes inputs, does work, and returns a result.',
    why: 'Functions let you name an idea once and reuse it everywhere. They are the first line of defense against duplicated logic — the “write it once” principle in code.',
    explanations: [
      E('analogy', 'eli5', 'A function is like a [[vending machine]]: you insert inputs (coins + button), the machine does its hidden work, and a result comes out. You don’t rebuild the machine each time — you just call it.'),
      E('simplified', 'eli5', 'A function is a named recipe: give it ingredients (inputs), it returns a dish (result), and you can use it as many times as you like.'),
      E('example', 'simple-example', 'function add(a, b) { return a + b }. Calling add(2, 3) returns 5. Calling add(10, 20) returns 30. Same recipe, different ingredients.'),
      E('steps', 'how-it-works', 'Anatomy of a function: 1) Parameters — named inputs. 2) Body — the steps. 3) Return — the output handed back. When called: the arguments are bound to the parameters, the body runs, and the caller receives the return value.'),
    ],
    terms: [
      T('parameter', 'The named input declared in the function definition.', 'The ingredient slot in the recipe.', 'In add(a, b): a and b are parameters.', 'Parameters are defined; arguments are supplied.'),
      T('argument', 'The actual value passed when calling the function.', 'The real ingredient you put in.', 'add(2, 3): 2 and 3 are arguments.', 'Argument vs parameter trips up beginners constantly.'),
      T('return value', 'The result the function hands back to the caller.', 'The dish that comes out.', 'return a + b hands back the sum.', 'What a function returns is what the caller sees.'),
    ],
    examples: {
      simple: 'function double(x) { return x * 2 } — double(4) → 8.',
      realistic: 'function totalPrice(items) — loops over items, applies tax, returns one number. Called from ten places, fixed in one place.',
      incorrect: '“A function always prints its result.” Printing is a side effect; the return value is the function’s actual output.',
    },
    keyIdeas: [
      KI('named reusable block', ['name', 'named', 'reuse', 'reusable', 'again']),
      KI('inputs → work → output', ['input', 'parameter', 'argument', 'take'], ['return', 'output', 'result', 'gives back']),
    ],
    prerequisites: ['c-prg-variable'],
    examWeight: 0.85,
    difficultyBase: 0.25,
  }),
  C({
    id: 'c-prg-loop',
    subjectId: 's-prg',
    topicId: 't-prg-basics',
    name: 'Loop',
    intro: 'A loop repeats a block of code until a condition says stop.',
    why: 'Computers exist to do repetitive work at scale. Loops express “do this for every item” or “keep going until done” without copying code.',
    explanations: [
      E('analogy', 'eli5', 'A loop is like a [[washing machine cycle]]: it repeats the same steps (wash, rinse, spin) until the cycle’s condition ends. You describe the steps once; the machine repeats them.'),
      E('simplified', 'eli5', 'A loop runs a piece of code again and again — usually once per item in a list, or while some condition is true.'),
      E('example', 'simple-example', 'for each student in class: print(student.name). With 30 students, the two lines run 30 times.'),
      E('steps', 'how-it-works', 'A loop has three parts: 1) Initialization — where to start. 2) Condition — whether to run the body again. 3) Update — moving toward the end. If the condition never becomes false: infinite loop.'),
    ],
    terms: [
      T('condition', 'A true/false check that decides whether the loop continues.', 'The “are we done?” question.', 'while (i < 10) — keep going while i is below 10.', 'The condition is the loop’s brake pedal.'),
      T('iteration', 'One pass through the loop body.', 'One repetition.', 'A 30-student loop has 30 iterations.', 'Counting iterations helps reason about loop cost.'),
    ],
    examples: {
      simple: 'Counting 1 to 5: five iterations of “print the number, add 1”.',
      realistic: 'Rendering every row of a table: one loop over the data list.',
      incorrect: '“Loops always run a fixed number of times.” While-loops run until a condition changes — possibly forever, if the update step is missing.',
    },
    keyIdeas: [
      KI('repeats code', ['repeat', 'again', 'each', 'every', 'over and over']),
      KI('until a condition ends it', ['condition', 'until', 'while', 'stop', 'when done']),
    ],
    prerequisites: ['c-prg-variable'],
    examWeight: 0.7,
    difficultyBase: 0.25,
  }),
  C({
    id: 'c-prg-array',
    subjectId: 's-prg',
    topicId: 't-prg-basics',
    name: 'Array',
    intro: 'An array is an ordered list of values, accessed by position number.',
    why: 'Programs constantly handle collections — scores, names, rows. Arrays give them one name and a position system.',
    explanations: [
      E('analogy', 'eli5', 'An array is a [[row of numbered lockers|lockers in a hallway]]: one name for the whole row, each locker numbered, one thing per locker — and the numbering starts at ZERO in most languages.'),
      E('simplified', 'eli5', 'An array is a list of values kept in order. items[0] is the first, items[1] the second.'),
      E('example', 'simple-example', 'scores = [90, 85, 77]. scores[0] → 90, scores.length → 3, scores[2] → 77.'),
      E('steps', 'how-it-works', 'Working with arrays: 1) Create with values in brackets. 2) Read by index — the position number. 3) Change by assigning to an index. 4) Iterate with a loop over indices or values.'),
    ],
    terms: [
      T('index', 'The position number of an element. In most languages, counting starts at 0.', 'The locker number.', 'In [10, 20, 30], 20 sits at index 1.', 'Off-by-one errors are the classic array bug.'),
    ],
    examples: {
      simple: '[10, 20, 30] — three elements, indices 0, 1, 2.',
      realistic: 'A shopping cart is an array of items; the receipt loops over it.',
      incorrect: '“The first element is at index 1.” In most languages (JS, Python, Java, C) it is index 0.',
    },
    keyIdeas: [
      KI('ordered list of values', ['list', 'ordered', 'sequence', 'order', 'collection']),
      KI('accessed by position/index', ['index', 'position', 'numbered', '0']),
    ],
    prerequisites: ['c-prg-variable'],
    examWeight: 0.75,
    difficultyBase: 0.25,
  }),
  C({
    id: 'c-prg-object',
    subjectId: 's-prg',
    topicId: 't-prg-objects',
    name: 'Object',
    intro: 'An object is a bundle of related data — named properties — describing one thing.',
    why: 'Real things have multiple facts: a player has a name, score, and position. Objects keep those facts together under one name instead of scattering variables.',
    explanations: [
      E('analogy', 'eli5', 'An object is like a [[luggage tag|luggage tag]]: one tag (the object) with labeled fields — name, flight, destination. You fill in values; the labels are the properties.'),
      E('simplified', 'eli5', 'An object is a thing described by named facts. player.name, player.score — one thing, many labeled facts.'),
      E('example', 'simple-example', 'player = { name: "Maria", score: 10, alive: true }. Read player.score → 10. Set player.score = 20.'),
      E('comparison', 'eli5', 'Object vs [[array|Array]]: an array is an ordered list (access by position); an object is a named-fact bundle (access by property name). Lists answer “what’s third?”; objects answer “what’s the score?”'),
    ],
    terms: [
      T('property', 'One named fact on an object.', 'One labeled field.', 'player.name is the “name” property.', 'Properties are the object’s vocabulary.'),
    ],
    examples: {
      simple: '{ name: "Rex", age: 4 } — one dog, two properties.',
      realistic: 'A page of user profiles: each profile rendered from one object with name, avatar, bio.',
      incorrect: '“An object and a class are the same.” An object is ONE concrete thing; a class is the blueprint for making many — see [[class|Class]].',
    },
    keyIdeas: [
      KI('bundle of named properties', ['properties', 'fields', 'named', 'bundle', 'attributes', 'key']),
      KI('describes one thing', ['one thing', 'one item', 'one entity', 'describes', 'represents']),
    ],
    prerequisites: ['c-prg-variable'],
    examWeight: 0.8,
    difficultyBase: 0.3,
  }),
  C({
    id: 'c-prg-class',
    subjectId: 's-prg',
    topicId: 't-prg-objects',
    name: 'Class',
    intro: 'A class is a blueprint for creating objects: it defines which properties and methods every instance will have.',
    why: 'Without classes, every object is hand-built and objects drift out of shape. A class guarantees that every player, order, or account built from it has the same structure and behavior.',
    explanations: [
      E('analogy', 'eli5', 'A class is a [[cookie cutter|cookie cutter]]; objects are the cookies. The cutter decides every cookie’s shape — but each cookie carries its own icing (its own property values). One cutter, many cookies.'),
      E('simplified', 'eli5', 'A class is a plan for making objects. You write the plan once, then stamp out as many objects as you need.'),
      E('example', 'simple-example', 'class Player { name; score; } — then: p1 = new Player("Maria"), p2 = new Player("Chen"). Two different objects, both shaped by the same class.'),
      E('comparison', 'how-it-works', 'Class vs [[object|Object]]:\n  • Class: the blueprint — exists once in code, holds no data itself.\n  • Object: one concrete instance — exists at runtime, holds real values.\nAsk: “Can I point at a specific one, with a specific name and score?” If yes, it’s an object.'),
      E('steps', 'how-it-works', 'Using a class: 1) Define it — list the properties and methods. 2) Instantiate — create an object from it (`new`). 3) Each object gets its own copy of the data; all share the same behavior.'),
    ],
    terms: [
      T('instance', 'One object created from a class.', 'One cookie from the cutter.', 'p1 is an instance of Player.', 'Instance and object are near-synonyms; “instance” emphasizes which class it came from.'),
      T('method', 'A function defined on a class — behavior every instance shares.', 'A skill every object of the class has.', 'Player.jump() is a method.', 'Methods + properties = what a class defines.'),
      T('constructor', 'The special method that runs when an object is created, filling in its starting values.', 'The setup that runs on creation.', 'new Player("Maria") runs the constructor with "Maria".', 'Constructors guarantee objects start complete.'),
    ],
    examples: {
      simple: 'class Dog { bark() } — rex = new Dog(); rex.bark() works because rex is built from the Dog blueprint.',
      realistic: 'A game defines class Enemy once; the level spawns 200 enemy objects, each with its own health.',
      incorrect: '“This class stores Maria’s score.” No — classes store no data; objects do. Maria’s score lives on a Player object.',
    },
    keyIdeas: [
      KI('blueprint for objects', ['blueprint', 'template', 'plan', 'cookie cutter', 'mold']),
      KI('objects are instances of it', ['instance', 'instances', 'objects from', 'creates objects', 'stamp']),
      KI('defines properties and methods', ['properties', 'methods', 'fields', 'behavior']),
    ],
    prerequisites: ['c-prg-object', 'c-prg-function'],
    misconceptions: [
      {
        label: 'A class is the same as an object',
        wrongIdea: '“Class” and “object” are interchangeable words for the same thing.',
        whyPlausible: 'Both live in “object-oriented programming”, and code examples show them side by side — `class Player` next to `new Player()`.',
        whereItBreaks: 'A class is the blueprint; an object is one concrete thing built from it. The class exists once; objects exist in any number, each with its own data. “Maria’s score” lives on an object, never on the class.',
        correction: 'Class = blueprint (once, no data). Object = instance (many, each with data).',
        contrast: {
          wrong: '“The Player class stores Maria’s score of 10.”',
          correct: '“A Player object (an instance) stores Maria’s score; the class only defines that players HAVE scores.”',
        },
        targetedExample: 'class BankAccount { balance } — two objects: maria.balance = 100, chen.balance = 50. If the class stored the balance, both would see the same number. They don’t — proof the data lives on objects.',
        detectPatterns: ['class is the same as an object', 'class and object are the same', 'same thing as an object', 'class is an object', 'object is the same as a class', 'interchangeable'],
        checkQuestionIds: ['q-prg-class-obj'],
      },
    ],
    examWeight: 0.85,
    difficultyBase: 0.4,
  }),
  C({
    id: 'c-prg-encapsulation',
    subjectId: 's-prg',
    topicId: 't-prg-objects',
    name: 'Encapsulation',
    intro: 'Encapsulation is the bundling of data and the methods that operate on that data into one unit — an object — while controlling access to the data.',
    why: 'Encapsulation is what keeps objects trustworthy: if anyone can reach in and edit `balance` directly, it can be set to -5000. If the balance can only change through deposit() and withdraw(), the object can enforce its own rules.',
    explanations: [
      E('definition', 'what', 'Encapsulation is the bundling of [[data]] (properties) and [[methods]] (functions) into a single object, so the object itself controls how its data is read and changed.'),
      E('analogy', 'eli5', 'Think of an [[ATM|ATM]]. Your money (data) is locked inside the bank. You cannot reach in and grab bills — you use the machine’s buttons ([[methods]]): deposit, withdraw, check balance. The machine enforces the rules (no negative withdrawals, PIN first). The ATM *bundles* the money with the only legal ways to touch it.'),
      E('simplified', 'eli5', 'Encapsulation means: an object keeps its data inside, and the only way to change the data is through the object’s own functions. The object guards its own stuff.'),
      E('example', 'simple-example', 'Without encapsulation: account.balance = -9999 (anyone, anywhere, any value). With encapsulation: balance is private; you call account.withdraw(50), and withdraw refuses if it would go below zero.'),
      E('steps', 'how-it-works', 'How encapsulation is built: 1) Mark the data private — outside code cannot touch it directly. 2) Expose methods — deposit(), withdraw(), getBalance() — as the only doors. 3) Put the rules INSIDE those methods. Now the object itself enforces its invariants.'),
      E('comparison', 'eli5', 'Encapsulation vs [[abstraction|just hiding]]: hiding data is the mechanism; the goal is control. Encapsulation means the object can *guarantee its own rules* — “balance never goes below 0” — because there is no other path to the data.'),
      E('scenario', 'realistic', 'A team ships a Timer class. A teammate directly sets timer.remainingMs = -50 from outside. Every callback now fires at impossible times. Making remainingMs private and exposing only start()/stop()/pause() removes an entire category of bugs — nobody can corrupt the state anymore.'),
    ],
    terms: [
      T('data', 'In this context: the properties (values) an object holds.', 'The object’s stored facts.', 'The balance in an account object.', 'Encapsulation is about who may touch this data and how.'),
      T('methods', 'Functions attached to an object/class — the only doors to the data.', 'The object’s own functions.', 'deposit() and withdraw() are methods.', 'Bundling data WITH methods is half of encapsulation; the methods are the doors.'),
      T('bundling', 'Putting data and the methods that belong to it into one unit.', 'Keeping stuff and its handlers together.', 'Balance + deposit() + withdraw() live in one class.', 'Bundling is the structural half of encapsulation.'),
      T('private', 'A visibility marker: only the object’s own methods may access this member.', '“Only my own code may touch this.”', 'private balance — outside code cannot read or write it directly.', 'Privacy is what lets the object control its data.'),
      T('invariant', 'A rule that must always hold true for the object (e.g., balance ≥ 0).', 'A rule that never breaks.', '“The balance is never negative” is an invariant.', 'Encapsulation exists so invariants cannot be violated from outside.'),
    ],
    examples: {
      simple: 'A counter object: private count, public increment() and value(). The only way to change the count is increment — it can never jump to 1000.',
      realistic: 'A Session object: private token, public login()/logout(). No code can leak or overwrite the token because it’s not reachable.',
      counter: 'A public “constants” object with fixed values nobody edits is NOT really encapsulation — nothing needs guarding.',
      edge: 'Getters/setters that just mirror every field (“getters and setters for everything”) miss the point — the value of encapsulation is in the rules the methods enforce, not in boilerplate.',
      incorrect: '“Encapsulation means hiding data so NOBODY can ever access it, including the object itself.” Wrong — the object’s own methods have full access; restriction applies to outside code only.',
    },
    keyIdeas: [
      KI('bundles data with methods', ['bundl', 'together', 'combines data', 'data and methods', 'data and its', 'one unit', 'groups data']),
      KI('controls access to the data', ['control', 'access', 'private', 'restrict', 'protect', 'guard', 'only through']),
      KI('object enforces its own rules', ['rules', 'invariant', 'enforce', 'guarantee', 'valid', 'prevent invalid']),
    ],
    prerequisites: ['c-prg-class', 'c-prg-object'],
    misconceptions: [
      {
        label: 'Encapsulation makes data totally inaccessible',
        wrongIdea: 'Encapsulation means nobody can access the data — not even the object itself.',
        whyPlausible: 'The word sounds like “capsule” — a sealed container — and explanations emphasize “hiding”.',
        whereItBreaks: 'If nobody could access the data, the object would be useless. The object’s own methods access the data freely; what’s restricted is *outside* code going around the methods.',
        correction: 'Encapsulation directs access through the object’s methods — outside code uses the doors; the object itself holds the keys.',
        contrast: {
          wrong: '“Encapsulation sealed the balance so even withdraw() cannot read it.”',
          correct: '“withdraw() reads and changes the balance freely; outside code must go through withdraw().”',
        },
        targetedExample: 'A BankAccount with private balance: account.withdraw(30) works (the method touches the data); account.balance = 0 fails (outside code cannot). One door, working; one wall, holding.',
        detectPatterns: ['nobody can access', 'no one can access', 'not even the object', 'completely inaccessible', 'sealed so nothing', 'cannot be accessed at all', 'even the object cannot'],
        checkQuestionIds: ['q-prg-enc-seal'],
      },
    ],
    examWeight: 0.9,
    difficultyBase: 0.45,
  }),
];

export const PRG_QUESTIONS: Question[] = [
  MC('q-prg-var-guided', 'c-prg-variable', 'What best describes a variable?', ['A fixed constant', 'A named place storing a value that can change', 'A printed number', 'A math equation'], { correctIndex: 1, difficultyBase: 0.15 }),
  MC('q-prg-fn-guided', 'c-prg-function', 'What does a function let you do?', ['Store one value forever', 'Name a reusable block of code that takes inputs and returns a result', 'Delete variables', 'Repeat code by copying it'], { correctIndex: 1, difficultyBase: 0.2 }),
  MC('q-prg-fn-arg', 'c-prg-function', 'In add(2, 3), what are 2 and 3?', ['Parameters', 'Arguments — the actual values passed to the call', 'Variables', 'Returns'], { correctIndex: 1, difficultyBase: 0.3 }),
  MC('q-prg-loop-guided', 'c-prg-loop', 'What stops a loop from running forever?', ['Nothing, loops are infinite', 'A condition that eventually becomes false', 'The computer’s battery', 'The return keyword'], { correctIndex: 1, difficultyBase: 0.25 }),
  MC('q-prg-arr-guided', 'c-prg-array', 'In scores = [90, 85, 77], what is scores[0]?', ['The length', 'The first element: 90', 'An error', 'Zero'], { correctIndex: 1, difficultyBase: 0.25 }),
  MC('q-prg-obj-guided', 'c-prg-object', 'What is an object?', ['An ordered list accessed by position', 'A bundle of named properties describing one thing', 'A function with no return', 'A class instance blueprint'], { correctIndex: 1, difficultyBase: 0.3 }),
  MC('q-prg-obj-vs-arr', 'c-prg-object', 'You need “the third item” from a collection. Which structure is designed for that?', ['An object — access by property name', 'An array — access by index/position', 'A function', 'A variable'], { correctIndex: 1, difficultyBase: 0.3 }),

  MC('q-prg-class-guided', 'c-prg-class', 'What is a class?', ['One concrete thing with data', 'A blueprint that defines how objects of its kind are built', 'A variable holding objects', 'A loop over objects'], { correctIndex: 1, difficultyBase: 0.3 }),
  MC('q-prg-class-obj', 'c-prg-class', 'Maria and Chen are both created from class Player. Which statement is correct?', [{ text: 'Player (the class) stores both their scores', misconceptionId: 'md_c-prg-class_a-class-is-the-same-as-an-object' }, 'Each object carries its own score; the class only defines that players have scores', 'Classes and objects are the same thing here', 'Only Maria is an object'], { correctIndex: 1, difficultyBase: 0.4, targetsMisconception: 'md_c-prg-class_a-class-is-the-same-as-an-object', hints: ['Where does Maria’s score actually live — in the blueprint or in the thing built from it?', 'The blueprint defines structure; objects carry data.'] }),
  APP('q-prg-class-apply', 'c-prg-class', 'Scenario: a game creates 200 monsters from one Monster class, then one monster levels up. Explain what changed and where.', 'only that one monster object’s data changed; the class and other 199 objects are unaffected', [['one', 'only that', 'that monster', 'single'], ['object', 'instance'], ['class', 'blueprint', 'others', 'other', 'unaffected', 'rest']], { difficultyBase: 0.5 }),

  MC('q-prg-enc-guided', 'c-prg-encapsulation', 'Encapsulation is best described as…', ['Hiding the code file from users', 'Bundling data with the methods that operate on it, controlling access', 'Deleting unused variables', 'Compiling code faster'], { correctIndex: 1, difficultyBase: 0.35, hints: ['Two parts: keeping data and its methods together, and controlling who can touch the data.'] }),
  MC('q-prg-enc-seal', 'c-prg-encapsulation', 'With encapsulation, who can access a private balance?', [{ text: 'Nobody at all, including the object itself', misconceptionId: 'md_c-prg-encapsulation_encapsulation-makes-data-totally-inaccessible' }, 'The object’s own methods (deposit/withdraw) — outside code must use those methods', 'Only the operating system', 'Anyone who imports the class'], { correctIndex: 1, difficultyBase: 0.45, targetsMisconception: 'md_c-prg-encapsulation_encapsulation-makes-data-totally-inaccessible', hints: ['If nobody could read the balance, how would withdraw() work?', 'The restriction applies to outside code — the object’s own methods are the doors.'] }),
  APP('q-prg-enc-apply', 'c-prg-encapsulation', 'Scenario: a ShoppingCart lets outside code set cart.items directly, and a bug sets it to null — the app crashes on checkout. How does encapsulation prevent this bug class?', 'make items private with addItem()/removeItem() as the only doors, so invalid states cannot be written from outside', [['private', 'methods', 'additem', 'removeitem', 'doors', 'through methods'], ['invalid', 'null', 'cannot', 'prevent', 'no outside']], { difficultyBase: 0.55 }),
  SA('q-prg-enc-explain', 'c-prg-encapsulation', 'Explain encapsulation in your own words: what gets bundled, and what does the bundling achieve?', 'data and methods bundled in one object; the object controls access so it can enforce its own rules', [['data', 'properties', 'values'], ['method', 'methods', 'functions'], ['control', 'access', 'private', 'restrict'], ['rules', 'invariant', 'enforce', 'guard', 'valid']], { difficultyBase: 0.5, cognitiveLevel: 'explanation' }),
  APP('q-prg-enc-transfer', 'c-prg-encapsulation', 'Transfer: a Thermostat in a smart home — temperature is internal; outside code can only call heat(), cool(), and readTemperature(). The room’s heating logic lives inside the Thermostat. Which encapsulation idea does this use, and why is direct temperature writing dangerous?', 'data and methods bundled with controlled access; direct writes could set impossible values and bypass the heating rules', [['bundle', 'together', 'data and', 'controlled', 'access', 'private'], ['impossible', 'invalid', 'bypass', 'break', 'wrong', 'inconsistent', 'rules']], { difficultyBase: 0.6, isTransfer: true }),
];

export const PRG_CARDS = [
  card('c-prg-variable', 'What is a variable?', 'A named storage place whose value can change.'),
  card('c-prg-function', 'Function anatomy', 'Parameters (inputs) → body (work) → return value (output).'),
  card('c-prg-class', 'Class vs object', 'Class = blueprint (once, no data). Object = instance (many, each with data).'),
  card('c-prg-encapsulation', 'Encapsulation = ', 'Bundling data with its methods + controlling access, so the object enforces its own rules.'),
];
