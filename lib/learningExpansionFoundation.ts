import { bankQuiz, numberQuestion, question, type LearningPackAssignment } from '@/lib/learningContentHelpers'
import type { QuizQuestion } from '@/components/QuizActivityRunner'

type Story = { passage: string; checks: Array<[string,string,string[]]> }
function storyQuestions(prefix: string, stories: Story[]): QuizQuestion[] {
  return stories.flatMap((story,idx) => story.checks.map(([prompt,answer,wrong],j) =>
    question(prefix+'-'+(idx+1)+'-'+(j+1),prompt,answer,wrong,
      'Look back at the story to find the evidence.',story.passage)
  ))
}
const kPictureWords: Array<[string,string,string]> = [
  ['🐜','ant','A'],['🐻','bear','B'],['🐱','cat','C'],['🐶','dog','D'],
  ['🥚','egg','E'],['🐟','fish','F'],['🐐','goat','G'],['🎩','hat','H'],
  ['🧊','ice','I'],['🪼','jellyfish','J'],['🪁','kite','K'],['🦁','lion','L'],
  ['🌙','moon','M'],['🪺','nest','N'],['🐙','octopus','O'],['🐷','pig','P'],
  ['🐰','rabbit','R'],['☀️','sun','S'],['🌳','tree','T'],['☂️','umbrella','U'],
]
const rhymes: Array<[string,string,string[]]> = [
  ['cat','hat',['dog','sun','pen']],['sun','run',['pig','bed','cup']],
  ['dog','log',['fan','cake','tree']],['pig','wig',['hat','bus','ten']],
  ['bed','red',['cup','top','fish']],['fox','box',['rain','cat','hop']],
  ['cake','lake',['pan','moon','dog']],['ball','tall',['sun','pig','bed']],
  ['fish','dish',['hat','run','map']],['rain','train',['duck','pig','box']],
  ['boat','goat',['tree','frog','hand']],['star','car',['cake','cup','fish']],
  ['bee','tree',['dog','hat','fox']],['mouse','house',['cat','sun','bed']],
  ['light','night',['fish','dog','ball']],['clock','sock',['goat','rain','pen']],
]
const vowels: Array<[string,string,string]> = [
  ['cat','c_t','a'],['dog','d_g','o'],['pig','p_g','i'],['sun','s_n','u'],
  ['bed','b_d','e'],['hat','h_t','a'],['fox','f_x','o'],['zip','z_p','i'],
  ['cup','c_p','u'],['pen','p_n','e'],['map','m_p','a'],['top','t_p','o'],
  ['fin','f_n','i'],['bug','b_g','u'],['hen','h_n','e'],['jam','j_m','a'],
  ['log','l_g','o'],['sit','s_t','i'],['mud','m_d','u'],['net','n_t','e'],
]
const kCountIcons = ['⭐','🍎','🐟','🌸','🧱','🍀','🐞','☀️','🐢','⚽','🍓','🚗','🐝','🍌','🎈','🧸','🐠','🌼']
const kCount = kCountIcons.map((icon,i)=>{
  const number = 1+(i%10)
  return numberQuestion('k-count-'+i,'How many '+icon+' do you see? '+icon.repeat(number),number,
    'Count every picture one time.')
})
const kLarger = Array.from({length:18},(_,i)=>{
  const first = 1+(i*3)%10
  const second = 1+((i*3+(i<10?4:6))%10)
  return numberQuestion('k-large-'+i,'Which number is BIGGER: '+first+' or '+second+'?',Math.max(first,second),
    'The bigger number means more objects.')
})
const kAddition = Array.from({length:18},(_,i)=>{
  const a = i%6
  const b = 1+Math.floor(i/6)
  return numberQuestion('k-add-'+i,'Count them together: '+a+' + '+b+' = ?',a+b,'Add the two groups together.')
})
const kSubtraction = Array.from({length:18},(_,i)=>{
  const start=3+(i%8),gone=1+Math.floor(i/8)
  return numberQuestion('k-sub-'+i,'You have '+start+' blocks. Take away '+gone+'. How many remain?',start-gone,'Subtract the blocks that go away.')
})
const kInitials = kPictureWords.map(([icon,word,letter],i)=>{
  const others=['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','R','S','T','U'].filter(c=>c!==letter)
  return question('k-initial-'+i,'Which letter starts '+word+'? '+icon,letter,others.slice((i*2)%15,(i*2)%15+3),'Say '+word+' slowly and listen to the first sound.')
})
const kRhymeBank = rhymes.map(([word,answer,wrong],i)=>question('k-rhyme-'+i,
  'Which word rhymes with '+word+'?',answer,wrong,
  'Rhyming words sound alike at the end.'))
const kVowels = vowels.map(([word,missing,vowel],i)=>question('k-vowel-'+i,
  'Complete the word '+missing+' to spell '+word+'. Which vowel belongs in the blank?',vowel,
  ['a','e','i','o','u'].filter(v=>v!==vowel).slice(0,3),'Say the word slowly and listen to the middle vowel sound.'))
const kLetters = kPictureWords.map(([icon,word,letter],i)=>question('k-letter-'+i,
  'Which letter goes with the picture '+icon+' ('+word+')?',letter,
  ['M','T','F','B','P','S','C','D','L','R','A','G','H','N','O','K','E','I','U'].filter(v=>v!==letter).slice((i*3)%15,(i*3)%15+3),
  'Think of the sound you hear at the beginning of the word.'))

const gradeOneStories: Story[]=[
  { passage:'Mia has a red kite. She goes to the park with Dad. The wind lifts the kite high. They smile when it flies.',
    checks:[
      ['What does Mia bring?','A red kite',['A blue ball','A toy train','A book']],
      ['Where does Mia go?','The park',['The store','The library','The pool']],
      ['Why does the kite fly high?','The wind lifts it',['Dad throws it into a tree','It has wheels','It is tied to a bird']],
    ] },
  { passage:'Ben and Jo make a small garden. They put seeds in soil. Each day they give the plants water. A tiny leaf pops up.',
    checks:[
      ['What do Ben and Jo plant?','Seeds',['Stones','Books','Balloons']],
      ['What do the plants get each day?','Water',['Snow','Paint','Candy']],
      ['What grows first?','A tiny leaf',['A bicycle','A chair','A kite']],
    ] },
  { passage:'A dog named Pip likes to nap. One day Pip sees a ball under the chair. Pip nudges it out with his nose and runs to play.',
    checks:[
      ['What is the dog called?','Pip',['Jo','Mia','Red']],
      ['Where is the ball?','Under the chair',['On the roof','In a pond','Beside a tree']],
      ['How does Pip move the ball?','With his nose',['With his paws only','With a stick','With his tail']],
    ] },
  { passage:'Lena makes a card for Grandma. She draws three yellow stars. She writes, “I love you.” Grandma puts the card on the fridge.',
    checks:[
      ['Who gets the card?','Grandma',['A teacher','A dog','A neighbor']],
      ['How many stars does Lena draw?','Three',['One','Two','Four']],
      ['Where does Grandma put it?','On the fridge',['Under the bed','In the yard','In a bag']],
    ] },
  { passage:'The class takes a short walk. They see a butterfly on a purple flower. The children stop to watch. Then they walk back to school.',
    checks:[
      ['What animal do they see?','A butterfly',['A turtle','A rabbit','A duck']],
      ['What color is the flower?','Purple',['Green','Blue','Orange']],
      ['What do the children do after they watch?','Walk back to school',['Ride a bus','Swim in a pool','Go shopping']],
    ] },
]
const gradeTwoStories: Story[]=[
  { passage:'Noah and his sister plan a picnic. Noah packs sandwiches and water. His sister brings a blanket. Dark clouds appear, so they picnic on the porch instead of at the park.',
    checks:[
      ['What does Noah pack?','Sandwiches and water',['Only a kite','Shoes and socks','Paint and brushes']],
      ['Why do they change their plan?','Dark clouds appear',['They lose their blanket','They have no food','The park is too far']],
      ['Where do they eat?','On the porch',['At the park','At school','On a bus']],
    ]},
  { passage:'Our library has a book swap box. Anyone may take a book and leave a book. Ava adds a story about oceans. The next morning, she sees a different book about planets.',
    checks:[
      ['What can people do with the book swap?','Take a book and leave a book',['Buy only new books','Borrow sports gear','Return library cards']],
      ['What topic is Ava’s book about?','Oceans',['Planets','Mountains','Bicycles']],
      ['What book does Ava see the next morning?','A book about planets',['A book about oceans','A comic about dogs','A cooking book']],
    ]},
  { passage:'A group of students builds a bridge with blocks. The first bridge falls when they put a toy car on it. They add extra supports. Their second bridge holds the car.',
    checks:[
      ['What are they building?','A bridge',['A tall tower','A garden bed','A bookshelf']],
      ['What happens to the first bridge?','It falls',['It holds three cars','It floats','It becomes taller']],
      ['How do they improve the bridge?','They add supports',['They use fewer blocks','They take away the road','They remove the car wheels']],
    ]},
  { passage:'Rina notices the classroom plant leaning toward the window. Her teacher explains that plants grow toward light. Rina turns the pot so the other side can get sunshine too.',
    checks:[
      ['What does Rina notice?','The plant leans toward the window',['The plant grows purple flowers','The plant loses its pot','The plant moves outside']],
      ['Why is the plant leaning?','It grows toward light',['It hears music','It is too cold','It needs more soil']],
      ['What does Rina do?','Turns the pot',['Closes the window','Takes off the leaves','Puts the plant in a box']],
    ]},
  { passage:'Leo wants to learn how to bake bread. He reads the recipe twice. He measures flour and water carefully. When the dough rises, he asks an adult for help with the hot oven.',
    checks:[
      ['What does Leo want to bake?','Bread',['Cookies','Soup','Pancakes']],
      ['How many times does Leo read the recipe?','Twice',['Once','Three times','Not at all']],
      ['Why does Leo ask an adult for help?','The oven is hot',['The flour is cold','The water is blue','The dough is too small']],
    ]},
]

function gridQuestions(prefix:string, pairs:Array<[number,number]>,op:'+'|'-'):QuizQuestion[]{
  return pairs.map(([a,b],i)=>numberQuestion(prefix+'-'+i,a+' '+op+' '+b+' = ?',op==='+'?a+b:a-b,
    op==='+'?'Add the two numbers.':'Start with the first number and take away the second.'))
}
const g1Adds = gridQuestions('g1-add',Array.from({length:20},(_,i)=>{
  const a=3+(i*11)%14;const b=1+(i*3+Math.floor(i/7))%Math.max(2,21-a);return [a,Math.min(b,20-a)]
}),'+')
const g1Subtracts=gridQuestions('g1-sub',Array.from({length:20},(_,i)=>{const a=6+(i*7)%15;return [a,1+(i*3)%a]}),'-')
const g1Tens=Array.from({length:18},(_,i)=>{
  const tens=1+i%9,ones=(i*7+3)%10;
  return numberQuestion('g1-place-'+i,'What number has '+tens+' tens and '+ones+' ones?',tens*10+ones,'Each ten is 10. Add the ones.')
})
const punctuationSentences: Array<[string,string]> = [
 ['Where is my backpack','?'],['I like to draw pictures','.'],
 ['What a wonderful surprise','!'],['Can we go outside','?'],
 ['My pencil is blue','.'],['Watch out','!'],
 ['Who brought the soccer ball','?'],['The bus stops here','.'],
 ['Hooray, we won the game','!'],['When does the library open','?'],
 ['I washed my hands','.'],['That was an amazing goal','!'],
 ['Can you help me read','?'],['The dog sleeps on the rug','.'],
 ['What a big rainbow','!'],['How many books did you borrow','?'],
 ['We planted seeds today','.'],['Look at that tall tower','!'],
]
const g1Punctuation=punctuationSentences.map(([sentence,correct],i)=>
 question('g1-punct-'+i,'Pick the right ending mark: '+sentence,
   correct,['.','?','!',','].filter(mark=>mark!==correct),
   'A question uses ?, a statement uses ., and a strong feeling may use !.'))
const g1Phonics=Array.from({length:20},(_,i)=>{
 const pairs:Array<[string,string,string[]]>=[
 ['cake','a_e',['a','ai','ee']],['bike','i_e',['i','ie','oa']],['home','o_e',['o','oo','ee']],
 ['cute','u_e',['u','oo','ai']],['rain','ai',['ee','oa','a_e']],['boat','oa',['ai','ee','i_e']],
 ['seed','ee',['oa','ai','u_e']],['play','ay',['oa','ie','ee']],['night','igh',['ai','a_e','oa']],
 ['light','igh',['ee','oa','ay']],['coat','oa',['ai','ee','u_e']],['train','ai',['ay','ee','o_e']],
 ['tree','ee',['oa','ai','igh']],['day','ay',['ee','oa','igh']],['note','o_e',['ai','ee','igh']],
 ['time','i_e',['o_e','ee','ai']],['lake','a_e',['i_e','oa','ai']],['road','oa',['ee','ay','a_e']],
 ['feet','ee',['oa','ai','ay']],['stay','ay',['oa','ee','igh']],
 ]; const [word,answer,wrong]=pairs[i]
 return question('g1-phonics-'+i,'Which letter pattern makes the long-vowel sound in '+word+'?',answer,wrong,
 'Look for the spelling pattern that helps the vowel say its name.')
})
const g2Addition=gridQuestions('g2-add',Array.from({length:20},(_,i)=>{
 const a=24+(i*17)%65,b=12+(i*9)%64;return [a,b]
}),'+')
const g2Subtraction=gridQuestions('g2-sub',Array.from({length:20},(_,i)=>{
 const a=53+(i*7)%47,b=10+(i*3)%38;return [a,b]
}),'-')
const g2Place=Array.from({length:20},(_,i)=>{
 const hundreds=1+(i%9),tens=(i*3+2)%10,ones=(i*7+1)%10
 return numberQuestion('g2-place-'+i, 'What number has '+hundreds+' hundreds, '+tens+' tens and '+ones+' ones?',hundreds*100+tens*10+ones,
 'A hundred is 100 and a ten is 10.')
})
const g2Time=Array.from({length:18},(_,i)=>{
 const hours=1+i%11,minutes=(i%4)*15,add=[15,30,45,60][i%4]
 const total=hours*60+minutes+add,nextHour=Math.floor(total/60)%12||12,nextMin=total%60
 const fmt=(h:number,m:number)=>h+':'+String(m).padStart(2,'0')
 return question('g2-time-'+i,'It is '+fmt(hours,minutes)+'. What time is '+add+' minutes later?',
   fmt(nextHour,nextMin),[fmt((nextHour%12)+1,nextMin),fmt(nextHour,(nextMin+15)%60),fmt(hours,minutes)],
   'Count forward in 15-minute steps.')
})
const g2GrammarItems: Array<[string,string,string[]]> = [
 ['Which word is an adjective?','bright',['run','jump','quickly']],
 ['Which word is a verb?','climb',['tall','blue','soft']],
 ['Which word describes a noun?','tiny',['dance','eat','run']],
 ['Which word names an action?','skip',['yellow','loud','small']],
 ['Which word tells HOW?','slowly',['tree','happy','jump']],
 ['Which word is a proper noun?','Boston',['city','river','street']],
 ['Which word is a plural noun?','books',['book','read','reading']],
 ['Which word is a contraction?','can’t',['cannot','could not','do not']],
 ['Which word is an adjective for weather?','sunny',['walk','talk','run']],
 ['Which word is a verb for talking quietly?','whisper',['quiet','red','kind']],
 ['Which word describes a flavor?','sweet',['eat','mix','serve']],
 ['Which word is a past-tense verb?','walked',['walk','walking','walks']],
 ['Which word names a place?','school',['quietly','bounce','helpful']],
 ['Which word is a plural noun for animals?','dogs',['dog','bark','loudly']],
 ['Which word describes a person?','kind',['read','write','quickly']],
 ['Which word tells WHEN something happens?','yesterday',['pencil','small','carry']],
 ['Which word is an action?','stretch',['careful','bright','soft']],
 ['Which word is a conjunction?','because',['under','happy','quickly']],
 ['Which word describes a sound?','loud',['listen','sing','slowly']],
 ['Which word is a singular noun?','apple',['apples','run','happily']],
]
const g2Grammar = g2GrammarItems.map(([prompt,correct,wrong],i)=>
 question('g2-grammar-'+i,prompt,correct,wrong,
   'Think about the job each word does in the sentence.'))

export const foundationalPack: LearningPackAssignment[] = [
 bankQuiz('K · Count the Pictures','math',['K'],'Count groups of objects to 10',kCount),
 bankQuiz('K · Which Number Is Bigger?','math',['K'],'Compare numbers from 1 to 10',kLarger),
 bankQuiz('K · Add Small Groups','math',['K'],'Add objects and numbers within 10',kAddition),
 bankQuiz('K · Take Away Blocks','math',['K'],'Subtract within 10',kSubtraction),
 bankQuiz('K · Beginning Letter Sounds','reading',['K'],'Match pictures to initial letters',kInitials),
 bankQuiz('K · Rhyming Words','reading',['K'],'Identify rhyming words',kRhymeBank),
 bankQuiz('K · Fill the Middle Vowel','reading',['K'],'Decode short CVC words',kVowels),
 bankQuiz('K · Letters and Picture Words','reading',['K'],'Recognize letters with picture clues',kLetters),
 bankQuiz('Grade 1 · Addition to 20','math',['1'],'Add numbers within 20',g1Adds,'support'),
 bankQuiz('Grade 1 · Subtraction to 20','math',['1'],'Subtract within 20',g1Subtracts,'support'),
 bankQuiz('Grade 1 · Tens and Ones','math',['1'],'Place value with tens and ones',g1Tens,'standard'),
 bankQuiz('Grade 1 · Sentence Ending Marks','grammar',['1'],'Use periods, question marks and exclamation points',g1Punctuation,'support'),
 bankQuiz('Grade 1 · Long Vowel Patterns','reading',['1'],'Identify long-vowel spellings',g1Phonics,'standard'),
 bankQuiz('Grade 1 · Little Stories','reading',['1'],'Read short passages and find details',storyQuestions('g1-story',gradeOneStories),'support'),
 bankQuiz('Grade 2 · Add Two-Digit Numbers','math',['2'],'Add two-digit numbers',g2Addition,'support'),
 bankQuiz('Grade 2 · Subtract Two-Digit Numbers','math',['2'],'Subtract two-digit numbers',g2Subtraction,'support'),
 bankQuiz('Grade 2 · Hundreds, Tens and Ones','math',['2'],'Identify three-digit place value',g2Place,'standard'),
 bankQuiz('Grade 2 · Time After the Clock','math',['2'],'Tell time in 15-minute increments',g2Time,'standard'),
 bankQuiz('Grade 2 · Word Jobs','grammar',['2'],'Recognize nouns, verbs, adjectives and adverbs',g2Grammar,'support'),
 bankQuiz('Grade 2 · Reading for Details','reading',['2'],'Read short passages and answer questions',storyQuestions('g2-story',gradeTwoStories),'standard'),
]
