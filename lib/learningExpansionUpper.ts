import { bankQuiz, writingPrompt, numberQuestion, question, type LearningPackAssignment } from '@/lib/learningContentHelpers'
import type { QuizQuestion } from '@/components/QuizActivityRunner'

// Short original text selections; every question contains the passage it requires.
const g3Contexts: Array<[string,string,string,string[]]> = [
 ['The class voted to plant trees near the playground. The trees would give shade on hot days.','Why did the class choose trees?','To make shade',['To block the doors','To remove the playground','To grow apples indoors']],
 ['Jules checked the weather before the soccer game. Rain was expected, so Jules packed a jacket.','Why did Jules bring a jacket?','Rain was expected',['It was a birthday gift','The game was indoors','Jules lost a shirt']],
 ['Two friends built a ramp. Their toy car rolled farther after they made the ramp steeper.','What changed the car’s distance?','The ramp became steeper',['The car changed colors','They removed its wheels','The car got smaller']],
 ['A community center collected books for a swap. The books went on shelves sorted by subject.','How did the center organize books?','By subject',['By the owner’s height','By cover color only','By price']],
 ['Lina found footprints in fresh snow. She followed them to a tree where a squirrel sat.','What probably made the footprints?','A squirrel',['A fish','A butterfly','A bicycle']],
 ['The school garden had dry soil. After the students watered it, the leaves looked less wilted.','What helped the plants?','Watering the soil',['Removing the soil','Turning off the lights','Picking every leaf']],
 ['At the science fair, Mia tested which paper airplane flew the farthest. She measured each flight with a tape measure.','How did Mia compare the flights?','She measured them',['She guessed from memory','She weighed the paper','She counted the seats']],
 ['A baker doubled a recipe because twice as many neighbors were coming to dinner.','Why did the baker double the recipe?','More people were coming',['The oven stopped working','There was no flour','The recipe was too spicy']],
 ['After a library story time, Amir borrowed a book about ocean animals. He wanted to learn more about whales.','Why did Amir choose the book?','He was curious about whales',['He wanted to learn baking','He needed a map','He disliked the ocean']],
 ['The group checked the bridge before crossing. They waited until an adult said it was safe.','Why did they wait?','To make sure it was safe',['To count the birds','To win a race','To collect leaves']],
 ['Plants near the sunny window grew taller than plants kept in a dark closet.','What conclusion fits the observation?','Sunlight helped growth',['Plants grow better in darkness','All plants need no water','Windows stop plant growth']],
 ['A lost dog wore a collar with a phone number. Maya called the number and its owner came to pick it up.','What helped Maya find the owner?','The phone number on the collar',['A picture on a wall','A park sign','A weather report']],
 ['The bus left fifteen minutes late, but the driver still followed every traffic rule.','What can you infer about the driver?','Safety was important',['The driver wanted to race','The bus had no seats','The trip was canceled']],
 ['Nora practiced her violin ten minutes every day. At the concert, she played her song smoothly.','What helped Nora improve?','Daily practice',['Buying a new chair','Missing rehearsal','Playing only at the concert']],
 ['At the museum, a guide asked visitors not to touch the old painting. Touching it could damage the surface.','Why was touching not allowed?','It could damage the painting',['The painting was too small','The museum was closing','The guide forgot its title']],
 ['The team listened to everyone’s ideas before choosing a plan.','Which skill did the team use?','Cooperation',['Guessing','Arguing','Ignoring others']],
]
const g3Literacy = g3Contexts.map(([passage,prompt,answer,wrong],i)=>
 question('g3-read-'+i,prompt,answer,wrong,'Use a detail from the passage to explain your choice.',passage))

const g3Mult = Array.from({length:20},(_,i)=>{
 const a=2+(i*7)%9, b=2+(i*3)%11
 return numberQuestion('g3-mul-'+i,a+' groups of '+b+' = ?',a*b,'Multiply the size of one group by the number of groups.')
})
const g3Div = Array.from({length:18},(_,i)=>{
 const divisor=2+i%9,quotient=2+(i*5)%10
 return numberQuestion('g3-div-'+i,(divisor*quotient)+' ÷ '+divisor+' = ?',quotient,'Think: which number times '+divisor+' equals '+(divisor*quotient)+'?')
})

const g4Fractions = Array.from({length:20},(_,i)=>{
 const den=4+i%8
 const pairs:Array<[number,number]>=[]
 for(let small=1;small<den-1;small++)for(let big=small+1;big<den;big++)pairs.push([small,big])
 const repetition=Math.floor(i/8)
 const [small,big]=pairs[(repetition*((i%8)+1)+(i%8))%pairs.length]
 const [num,b]=i%2===0?[small,big]:[big,small]
 const first=num+'/'+den,second=b+'/'+den
 return question('g4-fraction-'+i,'Which fraction is GREATER: '+first+' or '+second+'?',
   num>b?first:second,['They are equal','1/'+(den+1),'0/'+den],
   'When denominators are the same, compare the top numbers.')
})
const g4Context: Array<[string,string,string,string[]]> = [
 ['The pond freezes only when temperatures remain below freezing for several days.','What causes the pond to freeze?','Prolonged cold temperatures',['Hot sunshine','Fast wind alone','Leaves on the water']],
 ['The city added marked bike lanes. More people began biking to work because they felt safer.','What is the main idea?','Bike lanes helped people feel safe biking',['All workers stopped driving','The city closed the roads','Bikes became free']],
 ['A school held a clothing swap so families could reuse jackets and shoes.','Why organize the swap?','To reuse useful clothing',['To throw away every jacket','To sell new cars','To close the school']],
 ['A small seed can become a tree when it gets water, light, and enough time.','Which detail supports the growth idea?','Water and light help the seed grow',['Trees grow only in winter','Seeds never need soil','All seeds grow overnight']],
 ['The first robot prototype failed its test. The students changed its wheels and tested it again.','What is a lesson from the passage?','Testing helps improve designs',['Never revise a project','New wheels always fail','One test proves everything']],
 ['After the storm, volunteers cleared branches from sidewalks so people could walk safely.','Why did volunteers clear the branches?','To make sidewalks safe',['To hide the sidewalks','To build a fence','To block bicycles']],
 ['The family chose a train instead of driving because the train used less fuel per passenger.','What motivated their choice?','Reducing fuel use',['Avoiding the station','Getting extra luggage','Buying a new vehicle']],
 ['A scientist observed that the same plant grew toward a window each day. She recorded its direction in a notebook.','What did the scientist do?','Recorded observations',['Changed the plant each hour','Guessed without watching','Stopped using the notebook']],
 ['At the library, books about local history were grouped in one area to help visitors find them.','How did grouping books help?','Visitors could find them easily',['Books became shorter','Visitors read less','The library closed early']],
 ['The farmers planted different crops on one field each season to keep the soil healthy.','What was the purpose of changing crops?','Keeping soil healthy',['Removing all nutrients','Making fields smaller','Stopping harvests']],
 ['During an experiment, Sam changed one variable while keeping the other conditions the same.','Why change just one variable?','To see its effect more clearly',['To make results impossible to compare','To avoid measuring','To finish without testing']],
 ['The community mural showed portraits of neighbors and favorite places.','What did the mural celebrate?','The community',['Only the weather','A single recipe','The traffic lights']],
 ['The town opened a public water station so people could refill bottles instead of buying new ones.','What was one likely benefit?','Less single-use plastic',['More bottles thrown away','No drinking water','Closed parks']],
 ['Pigeons gathered near the benches whenever someone dropped crumbs.','What can be inferred?','The birds were searching for food',['The pigeons could not fly','The benches were painted','The park was flooded']],
 ['After reading many articles, Mina checked which authors used evidence rather than guesses.','What did Mina evaluate?','Source reliability',['Book cover colors','How fast she could read','Which pages were longest']],
 ['A garden uses rain barrels to collect water for dry days.','Why are rain barrels useful?','They save water for later',['They create extra rain','They stop plants from growing','They make soil salty']],
]
const g4MainIdeas = g4Context.map(([passage,prompt,answer,wrong],i)=>
 question('g4-idea-'+i,prompt,answer,wrong,'Use details in the passage to support the answer.',passage))

const g5Decimals = Array.from({length:20},(_,i)=>{
 const a=(10+(i*7)%90)/10, b=(2+(i*3)%36)/10, op=i%3===0?'-':'+'
 const exact=Math.round((op==='+'?a+b:a-b)*10)/10
 return question('g5-dec-'+i,a.toFixed(1)+' '+op+' '+b.toFixed(1)+' = ?',
   exact.toFixed(1),[ (exact+0.1).toFixed(1),(exact-0.1).toFixed(1),(exact+1).toFixed(1) ],
   'Align decimal points, then add or subtract tenths.')
})
const g5Context: Array<[string,string,string,string[]]> = [
 ['A new bus route connected neighborhoods with the hospital. Residents who did not drive could reach appointments more easily.','What was the main benefit?','Better access to the hospital',['Fewer hospital appointments','More cars on the street','Longer travel for everyone']],
 ['The students recorded river depth every week after rainfall. Their data showed that the river rose after heavy storms.','What does the evidence suggest?','Heavy rain can increase river depth',['Storms always dry rivers','River depth never changes','Rivers rise without rain only']],
 ['A character returned a lost wallet even though nobody had seen them find it.','Which trait does the character show?','Honesty',['Jealousy','Carelessness','Impatience']],
 ['The author compares the crowded hallway to a rushing river.','What is the comparison meant to suggest?','Fast movement and many people',['The hallway was underwater','The school was near a river','Nobody was moving']],
 ['Two sources give different dates for a local event. A student checks a city archive to settle the disagreement.','Why use the archive?','To verify the facts',['To choose the longest story','To avoid reading','To copy the first source']],
 ['The school replaced disposable plates with washable trays. Trash from lunch decreased.','What is supported by the passage?','Reusable trays reduced waste',['Lunch ended earlier','Food stopped being served','The trays were thrown out']],
 ['A team prepared for an emergency drill by mapping exits and practicing calm instructions.','Why did they prepare?','To respond safely',['To stay in class longer','To avoid knowing exits','To finish lunch quickly']],
 ['Before presenting her argument, Ava gathered data from several reliable sources.','What strengthened Ava’s argument?','Supporting evidence',['A louder voice','A longer title','More colorful paper']],
 ['The oak tree provided shade for decades until a storm damaged its branches.','What does decades mean?','Periods of ten years',['A few minutes','One week','A single month']],
 ['A volunteer translated instructions into more languages so families could understand the program.','What was the purpose?','Improve access for families',['Make rules more confusing','Remove instructions','Reduce the number of families']],
 ['The town studied traffic near a school before installing a new crossing signal.','What happened before the change?','Traffic was studied',['The school closed','The road vanished','Every car was replaced']],
 ['Nila chose to save a portion of her allowance each week for a bicycle.','What helped Nila reach her goal?','Regular saving',['Spending everything','Waiting without a plan','Borrowing every week']],
 ['The narrator describes the garden as calm and quiet after a noisy morning.','How did the mood change?','From busy to peaceful',['From warm to frozen','From empty to crowded','From dark to bright']],
 ['The experiment used three containers to compare how plants grow in different amounts of light.','What was being tested?','Amount of light',['Kinds of pots only','Size of the labels','Color of the room']],
 ['The students debated two ideas and chose a plan after weighing the advantages of each.','How did they choose?','They compared evidence and trade-offs',['They picked at random','They refused to discuss','They ignored all ideas']],
 ['A newspaper article quotes residents both for and against a new park design.','Why include both views?','To show different perspectives',['To prove no one cares','To avoid the topic','To remove all opinions']],
]
const g5Evidence=g5Context.map(([passage,prompt,answer,wrong],i)=>
 question('g5-evidence-'+i,prompt,answer,wrong,'Use what is stated or implied in the passage.',passage))

const g6Ratios = Array.from({length:20},(_,i)=>{
 const parts=2+(i%6), scale=2+(i*3)%8
 const total=parts*scale
 return numberQuestion('g6-ratio-'+i,
   'A recipe uses '+parts+' cups of oats for each batch. How many cups for '+scale+' batches?',
   total,'Multiply the amount per batch by the number of batches.')
})
const g6Rates = Array.from({length:18},(_,i)=>{
 const rate=3+(i%10),units=2+(i*5)%9
 return numberQuestion('g6-rate-'+i,'A machine packs '+rate+' boxes each minute. How many in '+units+' minutes?',
 rate*units,'Multiply rate by time to find total boxes.')
})
const g6Grammar: Array<[string,string,string[]]> = [
 ['What is a claim?','A statement that can be supported by evidence',['A list of random numbers','A picture without meaning','A punctuation mark']],
 ['What is supporting evidence?','Facts or examples that help prove a claim',['Only a personal guess','An unrelated story','A decorative title']],
 ['Which transition shows contrast?','However',['Therefore','For example','First']],
 ['Which transition shows a result?','Therefore',['Although','But','Meanwhile']],
 ['Which sentence uses a comma correctly?','Before lunch, we finished the project.',['Before lunch we, finished the project.','Before, lunch we finished the project.','Before lunch we finished, the project.']],
 ['What is a primary source?','A firsthand record',['A summary written years later','An advertisement about a book','A random online comment']],
 ['What is an inference?','A conclusion based on clues and knowledge',['A guess with no clues','Only the title of a book','A copied sentence']],
 ['Which word signals cause?','Because',['Although','Meanwhile','However']],
 ['What makes a comparison fair?','Using the same conditions',['Changing all factors at once','Ignoring measurements','Using different units randomly']],
 ['What is the purpose of a topic sentence?','Introduce the paragraph’s main idea',['End the book','List every citation','Repeat an unrelated detail']],
 ['Which word shows sequence?','Next',['But','Because','Despite']],
 ['What does revise mean in writing?','Improve a draft',['Erase every idea','Submit without reading','Change only the font']],
 ['What is a credible source?','One supported by trustworthy evidence',['One with the brightest color','One with no author','One without dates or details']],
 ['Which transition introduces an example?','For instance',['Nevertheless','However','On the other hand']],
 ['Which sentence has parallel structure?','We enjoy reading, biking, and swimming.',['We enjoy reading, to bike, and swim.','We enjoy read, biking, and to swim.','We enjoy to read, biking, and swimming.']],
 ['What is a counterargument?','A different viewpoint on the claim',['A second title','A word repeated often','A list of sources only']],
]
const g6Writing = g6Grammar.map(([prompt,answer,wrong],i)=>question('g6-writing-'+i,prompt,answer,wrong,'Think about how clear writers use evidence and structure.'))

const g7Integers=Array.from({length:20},(_,i)=>{
 const first=-12+(i*7)%25,second=-8+(i*7)%17
 const op=i%3===0?'-':'+'
 const total=op==='+'?first+second:first-second
 return question('g7-integer-'+i,'Calculate: ('+first+') '+op+' ('+second+') = ?',
   String(total),[String(total+1),String(total-1),String(total+3),String(-total)].filter(x=>x!==String(total)),
   'Add or subtract integers using a number line or the sign rules.')
})
const g7Reasoning: Array<[string,string,string[]]> = [
 ['Which statement is a testable claim?','More sunlight may increase plant growth.',['All plants are wonderful.','Green is the best color.','Summer is always fun.']],
 ['What is the strongest evidence?','Measured results from repeated tests',['An unsupported guess','A slogan','A rumor']],
 ['Why examine a counterclaim?','To consider other reasonable explanations',['To avoid all evidence','To change the topic','To remove every source']],
 ['What does a reliable source provide?','Evidence that can be checked',['Only colorful graphics','No author or date','Personal attacks']],
 ['Which question checks a statistic?','How was the sample selected?',['Is the chart blue?','Is the title exciting?','Do I like this number?']],
 ['What is an independent variable?','The factor deliberately changed in a test',['The final score','The factor measured as a result','A constant kept the same']],
 ['What is a dependent variable?','The result that is measured',['The experiment title','The researcher’s favorite color','The factor held constant']],
 ['Why repeat trials?','To check whether results are consistent',['To guarantee a preferred result','To remove all data','To avoid measurement']],
 ['What is correlation?','Two patterns changing together',['Proof that one event causes another','A completely random sentence','A type of punctuation']],
 ['What is a valid inference?','A conclusion supported by evidence',['An unrelated guess','Only a quotation','An answer chosen for speed']],
 ['Which is a sign of biased wording?','Language that unfairly favors one side',['Accurate measurements','Neutral descriptions','A clearly named source']],
 ['Why cite a source?','To let others check where information came from',['To make the text longer only','To hide evidence','To replace your own reasoning']],
 ['What is a sample in research?','A smaller group chosen from a population',['Every person in the world','A final opinion','The graph title']],
 ['What is an outlier?','A result far from most others',['The average value only','The most frequent category','The highest-grade assignment']],
 ['Which is a stronger conclusion?','The results suggest a pattern, but more tests are needed.',['One trial proves a universal rule.','The experiment has no limits.','Data should be ignored.']],
 ['When comparing sources, what matters most?','Evidence, author expertise, and date',['Font style alone','How many ads appear','The brightest image']],
]
const g7Evidence=g7Reasoning.map(([prompt,answer,wrong],i)=>question('g7-argument-'+i,prompt,answer,wrong,'Look for verifiable evidence and careful reasoning.'))

export const upperGradePack: LearningPackAssignment[]=[
 bankQuiz('Grade 3 · Multiplication Groups','math',['3'],'Understand multiplication as equal groups',g3Mult,'support'),
 bankQuiz('Grade 3 · Division Fact Families','math',['3'],'Divide using known multiplication facts',g3Div,'standard'),
 bankQuiz('Grade 3 · Read for Meaning','reading',['3'],'Find evidence, details and simple inferences',g3Literacy,'standard'),
 bankQuiz('Grade 4 · Compare Fractions','math',['4'],'Compare fractions with equal denominators',g4Fractions,'support'),
 bankQuiz('Grade 4 · Main Ideas and Evidence','reading',['4'],'Identify main ideas and supporting details',g4MainIdeas,'standard'),
 bankQuiz('Grade 5 · Decimal Operations','math',['5'],'Add and subtract numbers with tenths',g5Decimals,'standard'),
 bankQuiz('Grade 5 · Inferences and Evidence','reading',['5'],'Support inferences with text evidence',g5Evidence,'standard'),
 bankQuiz('Grade 6 · Ratios in Recipes','math',['6'],'Apply unit ratios to familiar situations',g6Ratios,'support'),
 bankQuiz('Grade 6 · Rates and Time','math',['6'],'Use rates to find total quantities',g6Rates,'standard'),
 bankQuiz('Grade 6 · Writing and Evidence','grammar',['6'],'Recognize claims, evidence and transitions',g6Writing,'standard'),
 bankQuiz('Grade 7 · Integer Operations','math',['7'],'Add and subtract positive and negative numbers',g7Integers,'standard'),
 bankQuiz('Grade 7 · Claims and Sources','reading',['7'],'Evaluate evidence, arguments and source reliability',g7Evidence,'standard'),
]

export const writingExpansionPack: LearningPackAssignment[]=[
 writingPrompt('K · My Favorite Animal',['K'],'Make a simple sentence',
   'What animal do you like? Write its name and one thing it can do.',
   ['I like the…','It can…','I see a…'],3,8),
 writingPrompt('Grade 1 · A Fun Day',['1'],'Write two complete sentences',
   'Tell about one thing you enjoyed this week. Where were you? What did you do?',
   ['One day I…','I went to…','My favorite part was…'],8,18),
 writingPrompt('Grade 2 · Our Helpful Community',['2'],'Describe a community helper',
   'Choose a person who helps your community. Describe the work they do and why it matters.',
   ['A person who helps is…','They help by…','This matters because…'],15,30),
 writingPrompt('Grade 3 · Build a Better Playground',['3'],'Explain an idea with supporting details',
   'Imagine you can add one new thing to the playground. Describe it and give two reasons it would help children.',
   ['I would add…','One reason is…','Another reason is…'],25,45,'standard'),
 writingPrompt('Grade 4 · Helping the Environment',['4'],'Write a clear explanatory paragraph',
   'Explain two ways your school or neighborhood could reduce waste. Give examples of how the changes would work.',
   ['One useful change would be…','For example…','Another way is…'],40,65,'standard'),
 writingPrompt('Grade 5 · Make Your Case',['5'],'Make a claim and support it',
   'Should the center offer more outdoor activities? State your opinion and support it with two specific reasons.',
   ['I think…','One reason is…','Another reason…','Some might argue…'],50,80,'standard'),
 writingPrompt('Grade 6 · Compare Two Solutions',['6'],'Compare alternatives and trade-offs',
   'Compare two ways a community can save water. Explain an advantage and a possible drawback of each approach.',
   ['The first solution is…','An advantage is…','In contrast…','I recommend…'],60,95,'standard'),
 writingPrompt('Grade 7 · Evidence-Based Recommendation',['7'],'Write a structured recommendation',
   'Your center is choosing between a new reading space and a new science lab. Recommend one, explain two benefits and address one concern fairly.',
   ['My recommendation is…','Evidence supporting it is…','A possible concern is…','Overall…'],80,120,'standard'),
]
