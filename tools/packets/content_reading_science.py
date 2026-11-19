"""
Content for the ACT Reading and ACT Science packets (built by build_series.py, build_passages).

Each packet: one lesson page, four passages, six questions per passage (24 in all).
Passage "paras": strings, or a list of rows (first row = header) to draw a data table.
Questions: (choices, index of the correct choice, explanation, skill, question text).
All four choices are shuffled with a fixed seed, so explanations never name a letter.
Science passages describe made-up experiments; their data are illustrative.
"""

READING_1 = {
    "slug": "act-reading-main-ideas-details",
    "seedKey": "act-reading-main-ideas-details-1",
    "number": 1,
    "title": "ACT Reading: Main Ideas & Details",
    "blurb": "Four passages, one of each ACT Reading type (literary narrative, social science, humanities, natural science), with questions on main ideas, details, word meaning and inference.",
    "description": "A one-page reading strategy lesson, then four passages with 24 questions on main ideas, details, vocabulary in context and inference, with explanations.",
    "minutes": 24,
    "lesson": [
        ("h", "1. Read for the big picture first"),
        ("p", "On your first read, don't try to memorize details. After each paragraph, ask: <i>what is this paragraph doing?</i> Jot two or three words in the margin (\"problem\", \"cost\", \"example\"). Those notes are your map when the questions send you back."),
        ("h", "2. Main idea questions"),
        ("b", "The right answer covers the <b>whole</b> passage. Wrong answers are usually true but too narrow (one paragraph) or too broad (more than the passage says)."),
        ("b", "Check the first and last paragraphs: they often state or restate the point."),
        ("h", "3. Detail questions"),
        ("b", "Go back and find the line. The answer is in the text, often reworded. Never answer a detail question from memory."),
        ("b", "Watch for answers that use words from the passage but change their meaning."),
        ("h", "4. Words in context"),
        ("b", "Cover the word, reread the sentence, and predict your own word. Then pick the choice closest to your prediction. The most common meaning of a word is often the trap."),
        ("ex", "\"Young trees must be watered until their roots are <i>established</i>.\" Prediction: settled, rooted. Not \"officially approved\", which is the dictionary's first meaning."),
        ("h", "5. Inference questions"),
        ("b", "An inference is a small step from the text, not a leap. If you can't point to the lines that support an answer, it's wrong."),
        ("b", "Strong words (<i>always, never, proves, only</i>) are usually wrong unless the passage uses them too."),
        ("h", "6. Pacing"),
        ("p", "Give each passage about 6 minutes: about 3 minutes to read and map it, about 3 minutes for the questions. If a question stalls you, guess, mark it, and come back."),
    ],
    "passages": [
        {
            "title": "Literary Narrative: The Apprentice",
            "paras": [
                "Mira had expected the shop to be quiet. Instead, on her first morning as Mr. Abernathy's apprentice, she found herself surrounded by ticking: dozens of clocks on the walls, on the shelves and on the floor beside the workbench, each a few seconds off from its neighbors, so that the room seemed to whisper all at once.",
                "\"You'll stop hearing it in a week,\" Mr. Abernathy said without looking up. He was bent over a pocket watch no bigger than a coin, holding a pair of tweezers so still that Mira wondered if he was breathing. \"And when you stop hearing it, you'll start listening.\"",
                "She did not understand what he meant. For the first month, he let her do nothing but sort screws by size and sweep brass filings from under the bench. She grew impatient. Her friends were already earning wages at the cannery, and she had chosen this dusty room over them because she wanted to make something.",
                "Then one afternoon in early spring, she looked up, startled, and realized that she could hear a single clock above all the others: the tall case clock by the door was running slow, its tick dragging like a tired foot. She crossed the room and opened its case. A spring had slipped.",
                "Mr. Abernathy watched her fix it. When she closed the glass door, he nodded once. \"Now,\" he said, \"you're listening.\"",
            ],
            "questions": [
                (["An apprentice who, through patience, learns to notice what her teacher values", "A girl who regrets leaving her job at a cannery", "A clockmaker who struggles to repair a pocket watch", "A shop that sells clocks at unusually low prices"], 0, "The story moves from Mira's confusion to the moment she hears the slow clock and earns Mr. Abernathy's approval. The other choices are details or are never stated.", "Main idea", "The passage is mainly about:"),
                (["Sorted screws and swept the floor", "Repaired pocket watches", "Worked at the cannery in the evenings", "Sold clocks to customers"], 0, "Paragraph 3: \"he let her do nothing but sort screws by size and sweep brass filings\".", "Details", "During her first month, Mira mostly:"),
                (["The clocks' slightly mismatched ticking made a soft, constant sound", "Customers were talking quietly", "Mr. Abernathy spoke in a low voice", "The clocks had stopped working"], 0, "Each clock was \"a few seconds off from its neighbors\", so the ticks blended into a whisper.", "Figurative language", "The phrase \"the room seemed to whisper all at once\" suggests that:"),
                (["Once the noise became familiar, Mira would notice what mattered in it", "Mira would eventually lose her hearing", "Mira should stop asking questions", "The clocks would soon be quieter"], 0, "That is exactly what happens later: she picks out the one clock that is running slow.", "Inference", "Mr. Abernathy's remark \"when you stop hearing it, you'll start listening\" most nearly means:"),
                (["She wanted to make something", "It paid more than the cannery", "Her friends recommended it", "Her family owned the shop"], 0, "Paragraph 3 says she chose the shop \"because she wanted to make something\". It paid less, if anything: her friends were \"already earning wages\".", "Details", "According to the passage, Mira chose the apprenticeship because:"),
                (["Approval that Mira had learned the lesson he hinted at", "Impatience with how slowly she worked", "Disappointment that the clock had broken", "A wish that she would leave the shop"], 0, "His last words, \"Now you're listening\", echo his earlier remark: she has learned it.", "Character", "Mr. Abernathy's nod at the end of the passage mainly shows:"),
            ],
        },
        {
            "title": "Social Science: Trees as Infrastructure",
            "paras": [
                "On a hot summer afternoon, a sunny asphalt parking lot can be far hotter than a lawn under a nearby tree. City planners have long known that trees cool their surroundings, both by casting shade and by releasing water vapor through their leaves. What has changed in recent years is how seriously cities take that fact.",
                "Many cities now treat trees as infrastructure, in the same category as pipes and roads. A mature tree can catch rainwater that would otherwise rush into storm drains, reducing the risk of flooding. Its roots help hold soil in place. Some studies even suggest that tree-lined streets encourage people to walk more and drive less.",
                "Trees are not free, however. Young trees must be watered for several years before their roots are established, and older trees need pruning so that branches do not fall on cars or power lines. A tree planted without a plan for its care may die within a few years, wasting the money spent to plant it.",
                "Planners have also noticed that trees are not spread evenly. In many cities, wealthier neighborhoods have far more tree cover than poorer ones, so the residents with the fewest resources to cope with heat often live on the hottest streets. Several cities have begun directing new plantings toward the neighborhoods with the least shade.",
            ],
            "questions": [
                (["To explain why cities now treat trees as important infrastructure, and what that involves", "To argue that cities should stop building parking lots", "To describe how leaves release water vapor", "To compare the costs of pipes and roads"], 0, "The passage covers the benefits, the costs and the uneven spread of trees. The others are passing details.", "Main idea", "The main purpose of the passage is:"),
                (["Catching rainwater before it reaches storm drains", "Absorbing water through their bark", "Blocking the wind that drives rain", "Lowering the temperature of rainwater"], 0, "Paragraph 2: a tree \"can catch rainwater that would otherwise rush into storm drains\".", "Details", "According to the passage, trees reduce the risk of flooding by:"),
                (["To point out the costs and responsibilities that come with planting trees", "To list more benefits of trees", "To describe a study about walking", "To explain why roads crack"], 0, "It opens with \"Trees are not free, however\" and then describes watering, pruning and wasted money.", "Structure", "The main function of the third paragraph is:"),
                (["Firmly rooted", "Officially approved", "Famous", "Proven"], 0, "Young trees need water until their roots are settled in the soil. \"Officially approved\" is a common meaning that doesn't fit here.", "Vocabulary in context", "As used in the third paragraph, \"established\" most nearly means:"),
                (["Are often those whose residents have the fewest resources to cope with heat", "Have the most parking lots", "Plant trees only for decoration", "Have the lowest risk of flooding"], 0, "Paragraph 4 links poorer neighborhoods, fewer trees and \"the hottest streets\".", "Inference", "The passage suggests that neighborhoods with the least shade:"),
                (["Tree-lined streets encourage people to walk more", "Trees cool their surroundings", "Young trees must be watered for several years", "Older trees need pruning"], 0, "Only this claim is hedged: \"Some studies even suggest\". The others are stated as facts.", "Author's approach", "Which claim does the author present most tentatively?"),
            ],
        },
        {
            "title": "Humanities: The Unfinished Sketch",
            "paras": [
                "Visitors to an art museum usually see only finished work: the polished painting, the carefully cast sculpture. Yet for many artists, the most revealing objects are the ones never meant for display. A sketchbook shows the false starts, the abandoned ideas, and the dozens of small decisions that a finished work hides.",
                "Consider a page on which an artist has drawn the same hand five times. In the first sketch, the fingers are stiff; in the third, the artist seems to have discovered how the thumb bends; by the fifth, the hand looks relaxed and alive. Seen together, the drawings tell a story of looking hard at something until it gives up its secrets.",
                "Some artists were embarrassed by their sketchbooks and destroyed them. Others kept every page. Historians are grateful to the second group, because sketches can answer questions that finished works cannot, such as which parts of a painting were planned from the start and which appeared only late in the process.",
                "There is also a simpler pleasure in looking at sketches. A finished painting can feel distant, as if it arrived complete. A sketch, with its smudges and second thoughts, reminds us that art is made by people who are, at first, just as uncertain as the rest of us.",
            ],
            "questions": [
                (["Sketchbooks reveal the process and uncertainty behind finished art", "Museums should display only sketches", "Artists should destroy their early work", "Finished paintings are less valuable than sketches"], 0, "Every paragraph shows what sketches reveal that finished work hides.", "Main idea", "The author's central claim is that:"),
                (["How an artist's understanding grows through repeated attempts", "That hands are the hardest subject to draw", "Why some artists destroyed their sketchbooks", "How museums choose what to display"], 0, "The hand goes from stiff to \"relaxed and alive\" across five tries.", "Purpose of an example", "The five drawings of a hand are used to illustrate:"),
                (["Sketches can show which parts of a work were planned and which came later", "Sketches sell for high prices", "Sketchbooks contain written diaries", "Sketches prove which artist painted a work"], 0, "Paragraph 3 says this directly.", "Details", "Historians are grateful to artists who kept their sketchbooks because:"),
                (["The artist finally understands the subject after careful study", "The subject is hiding something", "The drawing is thrown away", "The artist stops drawing hands"], 0, "\"Looking hard at something\" leads to understanding it: the secrets are how the hand really works.", "Figurative language", "The phrase \"until it gives up its secrets\" suggests that:"),
                (["Appreciative", "Dismissive", "Uninterested", "Embarrassed"], 0, "Words like \"most revealing\", \"grateful\" and \"simpler pleasure\" show admiration.", "Tone", "The author's attitude toward sketches is best described as:"),
                (["Feel distant, as if they arrived complete", "Be more truthful than sketches", "Hide other paintings beneath them", "Make viewers feel uncertain"], 0, "The last paragraph says this almost word for word.", "Details", "In the last paragraph, the author suggests that finished paintings can:"),
            ],
        },
        {
            "title": "Natural Science: Water Bears",
            "paras": [
                "Tardigrades, sometimes called water bears, are tiny animals, usually less than a millimeter long, that live in moss, soil and water around the world. Under a microscope they look almost cuddly: eight stubby legs, a round body and a slow, lumbering walk. Their reputation, however, is anything but gentle. Tardigrades are famous for surviving conditions that would kill nearly any other animal.",
                "Their most important trick is drying out on purpose. When its surroundings dry up, a tardigrade pulls in its legs, curls into a shape scientists call a tun, and loses almost all of the water in its body. Its metabolism slows to a nearly undetectable level. In this state, some tardigrades have been revived after years without water.",
                "How do their cells survive? Water normally helps hold proteins and cell membranes in their proper shapes, so losing it is usually fatal. Researchers have found that tardigrades make special proteins as they dry. These proteins appear to form a glass-like material that surrounds and protects the cell's delicate parts until water returns.",
                "Scientists hope that understanding these proteins could have practical uses. If medicines or vaccines could be protected in a similar way, they might be stored without refrigeration, making them easier to deliver to remote places.",
            ],
            "questions": [
                (["How tardigrades survive drying out, and why scientists study this ability", "The many habitats where tardigrades live", "How vaccines are refrigerated", "Why tardigrades walk slowly"], 0, "Paragraphs 2–4 explain the drying trick and its possible uses.", "Main idea", "The passage focuses mainly on:"),
                (["The curled, dried-out state a tardigrade enters", "A kind of moss", "A protein tardigrades produce", "The scientist who discovered tardigrades"], 0, "Paragraph 2: it \"curls into a shape scientists call a tun\".", "Vocabulary in context", "As used in the passage, a \"tun\" is:"),
                (["Water helps hold proteins and membranes in their proper shapes", "Cells need water to make glass", "Tardigrades drink large amounts of water", "Metabolism speeds up without water"], 0, "Paragraph 3 gives this reason directly.", "Details", "According to the passage, losing water is usually fatal because:"),
                (["Form a glass-like material that shields the cell's parts", "Pump water back into the cell", "Speed up the tardigrade's metabolism", "Help the tardigrade walk"], 0, "Paragraph 3: they \"form a glass-like material that surrounds and protects\" the cell.", "Details", "The special proteins appear to:"),
                (["For extreme toughness", "For being dangerous to humans", "For being friendly", "For moving slowly"], 0, "The next sentence explains: they survive conditions that kill almost anything else.", "Figurative language", "Saying the tardigrade's reputation is \"anything but gentle\" means it is known:"),
                (["Help medicines be stored without refrigeration", "Produce new kinds of moss", "Make tardigrades larger", "Replace vaccines altogether"], 0, "The last paragraph suggests protecting medicines \"in a similar way\".", "Inference", "The last paragraph suggests that this research might:"),
            ],
        },
    ],
}

READING_2 = {
    "slug": "act-reading-inference-craft",
    "seedKey": "act-reading-inference-craft-2",
    "number": 2,
    "title": "ACT Reading: Inference & Author's Craft",
    "blurb": "Four passages focused on the harder ACT Reading questions: what is implied, why the author made a choice, tone and point of view.",
    "description": "A one-page lesson on inference, tone, purpose and point of view, then four passages with 24 questions and an explanation for every answer.",
    "minutes": 24,
    "lesson": [
        ("h", "1. Inference: the smallest step"),
        ("p", "An inference question asks what the passage <i>suggests</i>. The right answer is never stated word for word, but it is always one short step from specific lines. If an answer needs a story you have to invent, it's wrong."),
        ("ex", "Text: \"She did not look up once.\" Supported: she is absorbed in her task. Not supported: she is angry at him. The text gives no reason to think so."),
        ("h", "2. Tone and attitude"),
        ("b", "Look at the author's word choices: \"grateful\", \"pleasure\" and \"revealing\" are positive; \"wasted\" and \"merely\" are negative."),
        ("b", "ACT tone answers are rarely extreme. \"Balanced\", \"appreciative\" and \"concerned\" are more common than \"furious\" or \"ecstatic\"."),
        ("h", "3. Purpose questions (\"mainly serves to …\")"),
        ("b", "Ask what the sentence or paragraph is <i>doing</i>: giving an example, adding a contrast, answering an objection, setting a scene."),
        ("b", "Then check that the choice's verb matches: an example <i>illustrates</i>, a counterpoint <i>qualifies</i>, a setting <i>establishes</i>."),
        ("h", "4. Point of view"),
        ("b", "Who is telling this? A narrator inside the story (\"I\") or outside it? A learner, an expert, an observer?"),
        ("b", "In fiction, separate what a character says from what the author wants you to notice."),
        ("h", "5. Figurative language"),
        ("p", "Translate the image into plain words. \"Every line clicked into place\" = it suddenly made sense. Pick the choice that keeps the meaning, not the one that keeps the picture."),
        ("h", "6. A three-step check for every answer"),
        ("b", "Can I point to the line? Does it answer <i>this</i> question? Is it as strong as the text, and no stronger?"),
    ],
    "passages": [
        {
            "title": "Literary Narrative: The Late Train",
            "paras": [
                "Daniel checked the departure board for the third time, as if the numbers might change if he stared hard enough. The 11:40 to Millbrook was still listed as delayed. Beside him, an older woman knitting a long gray scarf did not look up once.",
                "\"They always say delayed,\" she said, as though she had heard his thoughts. \"Then it comes when it pleases. I've ridden this line for thirty years.\" Her needles clicked steadily.",
                "Daniel had an interview at nine the next morning, his first in months, and he had planned to sleep, iron his shirt and read his notes twice. Now he imagined arriving at two in the morning, rumpled and exhausted. He paced to the edge of the platform and back.",
                "\"Sit,\" the woman said, patting the bench. \"Pacing doesn't make trains faster. Believe me, I've tested it.\" Despite himself, Daniel laughed. He sat. She asked about the interview, and before long he was explaining the job, then his reasons for wanting it, then things he had not said aloud to anyone: how afraid he was of hearing no again.",
                "When the train finally pulled in, she tucked the scarf into her bag. \"You'll do fine,\" she said. \"You already practiced on me.\"",
            ],
            "questions": [
                (["Calm acceptance that comes from long experience", "Angry frustration", "Anxious worry", "Complete confusion"], 0, "She knits steadily and has \"ridden this line for thirty years\"; delays don't bother her.", "Character", "The woman's attitude toward the delay is best described as:"),
                (["Daniel's worry was easy to see", "The woman could read minds", "Daniel had spoken aloud", "The woman worked for the railway"], 0, "He keeps checking the board, so his impatience shows. \"As though\" means it only seemed that way.", "Inference", "The phrase \"as though she had heard his thoughts\" suggests that:"),
                (["He is anxious about arriving late before his interview", "The platform is cold", "He is looking for a different train", "The woman annoys him"], 0, "Paragraph 3 connects the pacing to his fear of arriving \"rumpled and exhausted\".", "Inference", "Daniel paces mainly because:"),
                (["Ease Daniel's tension with humor", "Criticize the railway", "Show that she is a scientist", "End the conversation"], 0, "It works: \"Despite himself, Daniel laughed. He sat.\"", "Purpose", "The woman's joke about having \"tested\" pacing mainly serves to:"),
                (["Letting him voice his fears and talk through the job out loud", "Giving him directions to Millbrook", "Convincing him to skip the interview", "Teaching him to knit"], 0, "He explains the job and his reasons and admits his fear, which is the practice she mentions at the end.", "Inference", "The conversation helps Daniel mainly by:"),
                (["Talking with her was like a rehearsal for the interview", "She will interview him tomorrow", "He practiced knitting with her", "She wants him to call her later"], 0, "He has just described the job and his reasons to a stranger, as he will at the interview.", "Figurative language", "The woman's last line, \"You already practiced on me\", implies that:"),
            ],
        },
        {
            "title": "Social Science: The Price of a Free Gift",
            "paras": [
                "A grocery store hands out free samples of cheese. A charity mails a set of address labels with its request for donations. A car dealer offers you coffee while you wait. These small gifts may seem like simple kindness, but they also rely on one of the most powerful habits in human behavior: the urge to repay.",
                "Psychologists call this habit reciprocity. In many cultures, people feel uncomfortable when they owe someone, and they tend to relieve that discomfort by giving something back. The gift does not have to be large. What matters is that it creates a sense of obligation.",
                "Businesses and charities have learned to use this tendency. A shopper who accepts a sample may feel slightly guilty walking away without buying. A person who keeps the free labels may feel that a small donation is only fair.",
                "None of this means that every gift is a trick. Reciprocity is also the glue of friendships and communities; without it, neighbors would not lend tools and coworkers would not cover each other's shifts. The point is simply to notice the feeling of obligation, and then to decide for yourself whether to act on it.",
            ],
            "questions": [
                (["To explain how the urge to repay gifts shapes behavior, and to encourage readers to notice it", "To argue that all free samples are dishonest", "To describe the history of charities", "To teach readers how to sell cars"], 0, "The passage explains reciprocity, shows how it is used, then advises noticing it.", "Purpose", "The main purpose of the passage is:"),
                (["Show that small gifts appear in many everyday situations", "Compare the prices of three products", "Prove that such gifts are illegal", "Describe the author's own job"], 0, "Three quick, familiar examples lead into the general point.", "Purpose", "The three examples in the first paragraph mainly serve to:"),
                (["It creates a sense of obligation", "It is expensive", "It is gift-wrapped", "It comes from a friend"], 0, "\"What matters is that it creates a sense of obligation.\"", "Details", "According to the second paragraph, what makes a gift effective?"),
                (["Balanced", "Angry", "Sarcastic", "Enthusiastic about marketing"], 0, "It defends reciprocity (\"None of this means that every gift is a trick\") while still urging awareness.", "Tone", "The tone of the last paragraph is best described as:"),
                (["Something that holds relationships together", "A sticky substance", "A trap", "A cost"], 0, "The examples (lending tools, covering shifts) show reciprocity keeping communities connected.", "Vocabulary in context", "As used in the last paragraph, \"glue\" most nearly means:"),
                (["People benefit from noticing when they feel obligated", "People should refuse every free gift", "Reciprocity exists only in business", "Charities should stop mailing labels"], 0, "The final sentence says this. The other choices are more extreme than the text.", "Inference", "The author would most likely agree that:"),
            ],
        },
        {
            "title": "Humanities: Learning a Language from a Song",
            "paras": [
                "I learned my first full sentence of Portuguese from a song my roommate played every morning while making coffee. I had no idea what it meant. I only knew that by the end of the semester I could sing all three verses, and that the sounds had begun to feel less like noise and more like words waiting to be understood.",
                "When I finally looked up the lyrics, I was almost disappointed. The song I had imagined to be about love or the ocean was about a man who misses his bus. Yet knowing the meaning did not ruin it. Every line clicked into place, and grammar I had been struggling with in class suddenly made sense, because I had already heard it hundreds of times.",
                "Teachers sometimes worry that songs teach casual or incorrect language. That is partly true; lyrics bend rules for the sake of rhythm. But a textbook gives you the rules of a language, and a song gives you its music: where the stress falls, how words run together, how a question rises at the end.",
                "I still use textbooks. But whenever I start a new language now, I find a song first.",
            ],
            "questions": [
                (["A learner reflecting on personal experience", "A teacher describing her students", "A musician explaining how songs are written", "A scientist reporting research results"], 0, "The narrator says \"I\" throughout and describes learning Portuguese.", "Point of view", "The passage is told from the point of view of:"),
                (["Briefly disappointed, then pleased that it helped the grammar make sense", "Angry that the song was about a bus", "Uninterested", "Embarrassed in front of the roommate"], 0, "\"I was almost disappointed. … Yet knowing the meaning did not ruin it.\"", "Inference", "When the narrator learns what the lyrics mean, the narrator is:"),
                (["The lyrics suddenly made sense", "The music skipped", "The narrator memorized it faster", "The roommate stopped playing it"], 0, "The rest of the sentence explains: grammar \"suddenly made sense\".", "Figurative language", "The phrase \"every line clicked into place\" suggests that:"),
                (["Partly agrees but argues that songs teach the sound and rhythm of a language", "Rejects it completely", "Agrees fully and stops using songs", "Says textbooks are useless"], 0, "\"That is partly true … But a song gives you its music.\"", "Author's approach", "How does the narrator respond to teachers' worry about songs?"),
                (["Rules from textbooks with the \"music\" of a language from songs", "Portuguese with English", "Love songs with songs about the ocean", "Teachers with students"], 0, "The paragraph's last sentence sets up exactly this contrast.", "Structure", "The third paragraph contrasts:"),
                (["Uses both textbooks and songs", "Has given up textbooks", "Only studies Portuguese", "Has stopped learning languages"], 0, "\"I still use textbooks. But … I find a song first.\"", "Inference", "The last paragraph suggests that the narrator now:"),
            ],
        },
        {
            "title": "Natural Science: How Birds Find Their Way",
            "paras": [
                "Every autumn, billions of birds leave their breeding grounds and fly hundreds or even thousands of miles to spend the winter somewhere warmer. Many make the journey alone, at night, and on their first try. How they find their way has puzzled scientists for centuries.",
                "The answer appears to be that birds use several tools at once. Many species can sense Earth's magnetic field, which gives them a rough sense of direction even under cloudy skies. Others use the position of the sun, adjusting for the time of day with their internal clocks.",
                "Night migrants can also use the stars. In a series of classic experiments, young birds raised in a planetarium learned to treat whatever point the artificial sky rotated around as north. This suggested that the birds are not born knowing particular constellations; instead, they learn the center of the sky's rotation while young.",
                "Close to their destination, birds may switch to landmarks such as coastlines and mountain ranges, and some seabirds appear to rely on smell. Researchers now think of navigation less as a single sense and more as a toolkit, with each tool used when conditions favor it.",
            ],
            "questions": [
                (["Birds navigate using a combination of different cues", "Birds rely only on the stars", "Migration is unnecessary for most birds", "Planetariums confuse birds"], 0, "Magnetism, sun, stars, landmarks and smell: the passage calls it a toolkit.", "Main idea", "The main idea of the passage is that:"),
                (["It gives a sense of direction even under cloudy skies", "It shows the bird exact landmarks", "It works only at noon", "It helps birds smell"], 0, "Paragraph 2 says this directly.", "Details", "According to the passage, a magnetic sense is useful because:"),
                (["Young birds learn the center of the sky's rotation rather than being born knowing the constellations", "Birds cannot see stars", "Birds are born knowing the constellations", "Birds prefer artificial light"], 0, "The birds treated whatever the fake sky turned around as north, so they learned it.", "Inference", "The planetarium experiments suggested that:"),
                (["Well known and influential", "Old-fashioned", "Related to music", "Simple"], 0, "\"Classic experiments\" are famous, often-cited ones.", "Vocabulary in context", "As used in the third paragraph, \"classic\" most nearly means:"),
                (["Birds use different cues depending on conditions", "Birds carry objects with them", "Navigation must be taught by people", "Only seabirds can navigate"], 0, "\"Each tool used when conditions favor it.\"", "Figurative language", "Comparing navigation to a \"toolkit\" emphasizes that:"),
                (["Explain why birds' navigation is so puzzling", "Show that most migrating birds die", "Prove that birds migrate in groups", "Suggest that birds prefer the cold"], 0, "Flying alone, at night and for the first time makes the feat harder to explain.", "Purpose", "The details about birds flying alone, at night and on their first try mainly serve to:"),
            ],
        },
    ],
}

SCIENCE_1 = {
    "slug": "act-science-data-representation",
    "seedKey": "act-science-data-representation-1",
    "number": 1,
    "title": "ACT Science: Reading Data",
    "blurb": "Most ACT Science questions are really data questions. Four passages built around tables teach you to read values, spot trends, estimate between points and predict beyond them.",
    "description": "A one-page lesson on reading tables and trends, then four data passages with 24 questions on values, trends, interpolation, prediction and variables, with explanations.",
    "minutes": 20,
    "lesson": [
        ("h", "1. You don't need to know the science"),
        ("p", "Nearly every answer is in the table or the text. Read the introduction quickly, then go straight to the data. Outside knowledge is needed for only a few questions on the whole test."),
        ("h", "2. Read the table before the questions"),
        ("b", "Read the column headings and <b>units</b> first (cm, °C, g per 100 g of water)."),
        ("b", "Find the variable that was changed on purpose (the <b>independent</b> variable) and the one that was measured (the <b>dependent</b> variable)."),
        ("h", "3. Trends"),
        ("b", "As one variable goes up, does the other go up, go down, rise then fall, or stay about the same?"),
        ("b", "Check whether the change is steady (same jump each step) or levels off (jumps get smaller)."),
        ("ex", "Light 4 → 8 → 12 → 16 hours; height 6.2 → 10.5 → 14.1 → 14.8 cm. The height rises, but by less each time: it levels off."),
        ("h", "4. Between and beyond the data"),
        ("b", "<b>Interpolate</b>: a value between two rows lies between their results. 70 °C lies between the 60 °C and 80 °C results."),
        ("b", "<b>Extrapolate</b>: continue the trend past the last row. If the values level off, predict only a small change."),
        ("h", "5. Quick maths"),
        ("b", "Differences: subtract. \"How many times as much\": divide. Round freely; answer choices are usually far apart."),
        ("h", "6. Pacing"),
        ("p", "Spend about 5 minutes per passage. Answer the \"look up one value\" questions first, then the trend and prediction questions."),
    ],
    "passages": [
        {
            "title": "Light and Plant Growth",
            "paras": [
                "A student grew bean plants under lamps that were left on for different numbers of hours per day. All plants got the same soil, water and temperature. After 4 weeks, the student measured each plant's height and counted its leaves (Table 1).",
                [["Light (hours/day)", "Height (cm)", "Number of leaves"], ["4", "6.2", "5"], ["8", "10.5", "8"], ["12", "14.1", "11"], ["16", "14.8", "12"]],
                "Table 1",
            ],
            "questions": [
                (["14.1 cm", "10.5 cm", "14.8 cm", "11 cm"], 0, "Read the 12-hour row of Table 1. (11 is its leaf count, not its height.)", "Reading a value", "According to Table 1, what was the height of the plants grown with 12 hours of light per day?"),
                (["Increased, but by smaller amounts at higher light levels", "Increased by the same amount at each step", "Decreased", "Stayed the same"], 0, "The jumps are 4.3, then 3.6, then only 0.7 cm.", "Trends", "As the hours of light increased from 4 to 16, plant height:"),
                (["About 15 cm", "About 6 cm", "About 10 cm", "About 25 cm"], 0, "Height was already leveling off (14.1 → 14.8 cm), so 20 hours would add very little.", "Prediction", "Based on the trend in Table 1, plants grown with 20 hours of light per day would most likely be about how tall?"),
                (["The hours of light per day", "The amount of water", "The type of soil", "The plant height"], 0, "Water and soil were kept the same; height was measured. Light was changed on purpose.", "Experimental design", "Which variable did the student deliberately change?"),
                (["12 hours", "4 hours", "8 hours", "16 hours"], 0, "The 12-hour row shows 11 leaves.", "Reading a value", "Plants with 11 leaves had been grown under how many hours of light per day?"),
                (["4.3 cm", "3.6 cm", "0.7 cm", "16.7 cm"], 0, "10.5 − 6.2 = 4.3 cm.", "Calculations", "How much taller were the 8-hour plants than the 4-hour plants?"),
            ],
        },
        {
            "title": "Temperature and Solubility",
            "paras": [
                "Solubility is the maximum mass of a substance that dissolves in a given amount of water. Students measured the solubility of two solids, Substance X and Substance Y, in 100 g of water at five temperatures (Table 1).",
                [["Temperature (°C)", "X (g per 100 g water)", "Y (g per 100 g water)"], ["0", "13", "36"], ["20", "32", "36"], ["40", "64", "37"], ["60", "110", "37"], ["80", "169", "38"]],
                "Table 1",
            ],
            "questions": [
                (["64 g", "37 g", "32 g", "110 g"], 0, "The 40 °C row, column X.", "Reading a value", "According to Table 1, the solubility of Substance X at 40 °C is:"),
                (["Substance X, because its solubility rises sharply as temperature rises", "Substance Y, because its solubility rises sharply as temperature rises", "Substance X, because its solubility stays nearly constant", "Neither, because both change by the same amount"], 0, "X goes from 13 to 169 g; Y only goes from 36 to 38 g.", "Comparing data", "Which substance's solubility depends more on temperature?"),
                (["Between 20 °C and 40 °C", "Between 0 °C and 20 °C", "Between 40 °C and 60 °C", "The solubilities are never equal"], 0, "At 20 °C, X (32) is below Y (36); at 40 °C, X (64) is above Y (37). They cross in between.", "Interpolation", "At what temperature range are the solubilities of X and Y equal?"),
                (["72 g", "36 g", "18 g", "136 g"], 0, "36 g dissolves in 100 g of water, so twice the water dissolves twice as much: 72 g.", "Calculations", "About how much Substance Y dissolves in 200 g of water at 20 °C?"),
                (["About 140 g", "About 90 g", "About 180 g", "About 37 g"], 0, "70 °C is halfway between 60 °C (110 g) and 80 °C (169 g), so roughly 140 g.", "Interpolation", "The solubility of Substance X at 70 °C is closest to:"),
                (["No, because Substance Y's solubility barely changes with temperature", "Yes, because Substance X's solubility rises sharply", "Yes, because both solubilities rise", "No, because Substance X's solubility falls"], 0, "One counterexample is enough: Y changes by only 2 g across 80 °C.", "Evaluating a claim", "A student claims that the solubility of all solids rises sharply with temperature. Do the data support this claim?"),
            ],
        },
        {
            "title": "Altitude, Air Pressure and Boiling",
            "paras": [
                "Water boils when its vapor pressure equals the pressure of the air around it. Table 1 shows typical air pressure and the boiling point of pure water at several altitudes above sea level.",
                [["Altitude (m)", "Air pressure (kPa)", "Boiling point (°C)"], ["0", "101", "100"], ["1,000", "90", "97"], ["2,000", "80", "93"], ["3,000", "70", "90"], ["4,000", "62", "87"]],
                "Table 1",
            ],
            "questions": [
                (["80 kPa", "90 kPa", "93 kPa", "70 kPa"], 0, "The 2,000 m row. (93 is the boiling point.)", "Reading a value", "According to Table 1, the air pressure at 2,000 m is:"),
                (["Both air pressure and boiling point decrease", "Both increase", "Air pressure increases and boiling point decreases", "Air pressure decreases and boiling point stays the same"], 0, "Read down both columns: 101 → 62 kPa and 100 → 87 °C.", "Trends", "As altitude increases, how do air pressure and boiling point change?"),
                (["About 88 °C", "About 92 °C", "About 85 °C", "About 100 °C"], 0, "3,500 m is between 3,000 m (90 °C) and 4,000 m (87 °C).", "Interpolation", "The boiling point of water at 3,500 m is closest to:"),
                (["4,000 m", "0 m", "1,000 m", "2,000 m"], 0, "Water boils at the lowest temperature (87 °C) there, so the food cooks at a lower temperature and takes longest.", "Applying data", "At which altitude would pasta cooked in boiling water take the longest to cook?"),
                (["97 °C", "100 °C", "93 °C", "90 °C"], 0, "Find 90 kPa in the pressure column; its boiling point is 97 °C.", "Reading a value", "Where the air pressure is 90 kPa, water boils at:"),
                (["About 3 °C", "About 10 °C", "About 1 °C", "About 30 °C"], 0, "Over 4,000 m the boiling point drops 13 °C, about 3 °C per 1,000 m.", "Calculations", "On average, the boiling point drops by about how much for every 1,000 m of altitude?"),
            ],
        },
        {
            "title": "Enzymes and pH",
            "paras": [
                "Enzymes are proteins that speed up chemical reactions, and each works best within a certain pH range. (Low pH is acidic; high pH is basic.) Researchers measured the activity of two digestive enzymes, A and B, at five pH values (Table 1). Higher numbers mean a faster reaction.",
                [["pH", "Enzyme A activity", "Enzyme B activity"], ["2", "85", "0"], ["4", "40", "15"], ["6", "10", "70"], ["8", "2", "95"], ["10", "0", "30"]],
                "Table 1",
            ],
            "questions": [
                (["pH 2", "pH 4", "pH 6", "pH 8"], 0, "Enzyme A's highest activity, 85, is at pH 2.", "Reading a value", "At which pH was Enzyme A most active?"),
                (["Increases from pH 2 to pH 8, then decreases", "Increases steadily from pH 2 to pH 10", "Decreases steadily from pH 2 to pH 10", "Stays about the same"], 0, "0 → 15 → 70 → 95, then down to 30.", "Trends", "As pH increases from 2 to 10, the activity of Enzyme B:"),
                (["Enzyme B", "Enzyme A", "Both are equally active", "Neither is active"], 0, "At pH 6, B is 70 and A is 10.", "Comparing data", "At pH 6, which enzyme is more active?"),
                (["pH 4", "pH 2", "pH 6", "pH 10"], 0, "Differences: pH 2 → 85, pH 4 → 25, pH 6 → 60, pH 10 → 30. The smallest is at pH 4.", "Calculations", "At which of these pH values is the difference in activity between the two enzymes smallest?"),
                (["Enzyme A, because it is most active at low pH", "Enzyme B, because it is most active at pH 8", "Enzyme B, because it is active at every pH", "Neither, because both are inactive below pH 6"], 0, "A very acidic stomach means a low pH, where A works best and B barely works.", "Applying data", "The stomach is very acidic. Which enzyme is more likely to work in the stomach?"),
                (["pH", "Enzyme A activity", "Enzyme B activity", "Reaction temperature"], 0, "The researchers chose the pH values; activity was what they measured.", "Experimental design", "Which was the independent variable in this study?"),
            ],
        },
    ],
}

SCIENCE_2 = {
    "slug": "act-science-experiments-viewpoints",
    "seedKey": "act-science-experiments-viewpoints-2",
    "number": 2,
    "title": "ACT Science: Experiments & Viewpoints",
    "blurb": "Research summaries and conflicting viewpoints: understand how experiments are designed, what controls are for, and how evidence supports or weakens a hypothesis.",
    "description": "A one-page lesson on experimental design and conflicting viewpoints, then four passages with 24 questions on variables, controls, predictions and competing hypotheses.",
    "minutes": 20,
    "lesson": [
        ("h", "1. The parts of an experiment"),
        ("b", "<b>Independent variable</b>: what the scientist changes on purpose."),
        ("b", "<b>Dependent variable</b>: what is measured as a result."),
        ("b", "<b>Controlled variables</b>: everything kept the same, so the comparison is fair."),
        ("b", "<b>Control trial</b>: a trial without the factor being tested (0% sugar, no fertilizer), used as a baseline."),
        ("ex", "Study 2 hangs pendulums of different masses on the same 1.0 m string. Mass is independent, period is dependent, and length is controlled."),
        ("h", "2. Comparing experiments"),
        ("b", "Ask what changes from Experiment 1 to Experiment 2. That change is the point of the second experiment."),
        ("b", "If the same conditions appear in both experiments, the results should match. That's a quick consistency check."),
        ("h", "3. Conflicting viewpoints"),
        ("p", "Two or more scientists or students explain the same observation differently. Before reading the questions, write one line for each: <i>Student 1 says the cause is __; Student 2 says it is __.</i>"),
        ("b", "<b>Agree</b> questions: look for what both accept (usually the observation itself)."),
        ("b", "<b>Support/weaken</b> questions: a finding supports a view if that view predicts it and the other doesn't."),
        ("b", "<b>Prediction</b> questions: answer as that person would, even if you disagree."),
        ("h", "4. Designing a test"),
        ("p", "A good test changes only the factor in question and keeps everything else the same. To test \"temperature causes it\", vary temperature and hold everything else constant."),
    ],
    "passages": [
        {
            "title": "Pendulums",
            "paras": [
                "The period of a pendulum is the time it takes to swing out and back once. Students timed pendulums made from a small weight on a light string.",
                "<b>Study 1:</b> A 100 g weight was hung on strings of different lengths.",
                [["Length (m)", "0.25", "0.50", "1.00", "2.00"], ["Period (s)", "1.0", "1.4", "2.0", "2.8"]],
                "<b>Study 2:</b> Weights of different masses were hung on a 1.00 m string.",
                [["Mass (g)", "50", "100", "200"], ["Period (s)", "2.0", "2.0", "2.0"]],
            ],
            "questions": [
                (["The length of the string", "The mass of the weight", "The period", "The number of swings"], 0, "Every Study 2 trial used a 1.00 m string; only the mass changed.", "Variables", "In Study 2, which variable was held constant?"),
                (["Does not depend on the mass of the weight", "Doubles when the mass doubles", "Decreases as the mass increases", "Depends on the mass only above 100 g"], 0, "All three masses gave 2.0 s.", "Interpreting results", "The results of Study 2 show that the period:"),
                (["4.0 s", "2.8 s", "5.6 s", "8.0 s"], 0, "Each time the length is multiplied by 4, the period doubles (0.25 m → 1.0 s, 1.00 m → 2.0 s), so 4.00 m → 4.0 s.", "Prediction", "Based on Study 1, a pendulum with a 4.00 m string would most likely have a period of about:"),
                (["To find out how the length of the string affects the period", "To find out how the mass affects the period", "To measure the mass of the weight", "To compare different kinds of string"], 0, "Study 1 changed only the length.", "Experimental design", "The main purpose of Study 1 was:"),
                (["1.0 s", "0.5 s", "2.0 s", "4.0 s"], 0, "Mass doesn't matter (Study 2), so use Study 1's 0.25 m result: 1.0 s.", "Combining studies", "What period would a 200 g weight on a 0.25 m string most likely have?"),
                (["Using a longer string", "Using a heavier weight", "Using a shorter string", "Using a lighter weight"], 0, "Only length changed the period, and longer strings gave longer periods.", "Applying results", "Which change would make a pendulum's period longer?"),
            ],
        },
        {
            "title": "Yeast and Gas Production",
            "paras": [
                "Yeast releases carbon dioxide gas as it breaks down sugar. Students mixed equal amounts of yeast and water in flasks and collected the gas produced in 20 minutes.",
                "<b>Experiment 1:</b> All flasks were kept at 30 °C. The sugar concentration was varied.",
                [["Sugar (%)", "0", "5", "10", "20"], ["Gas (mL)", "0", "12", "22", "24"]],
                "<b>Experiment 2:</b> All flasks contained 10% sugar. The temperature was varied.",
                [["Temperature (°C)", "10", "20", "30", "40", "50"], ["Gas (mL)", "4", "11", "22", "18", "2"]],
            ],
            "questions": [
                (["30 °C", "20 °C", "40 °C", "50 °C"], 0, "22 mL at 30 °C is the most gas in Experiment 2.", "Reading a value", "In Experiment 2, which temperature produced the most gas?"),
                (["Temperature", "Sugar concentration", "Gas volume", "Time of day"], 0, "Every Experiment 1 flask was kept at 30 °C.", "Variables", "In Experiment 1, which variable was held constant?"),
                (["To serve as a control, showing that the yeast makes no gas without sugar", "To make the yeast grow faster", "To test the effect of temperature", "To measure how much water the yeast used"], 0, "A no-sugar baseline shows that the gas comes from breaking down sugar.", "Experimental design", "Why did the students include a flask with 0% sugar?"),
                (["22 mL", "12 mL", "24 mL", "18 mL"], 0, "10% sugar at 30 °C appears in both experiments, and both gave 22 mL.", "Combining experiments", "Both experiments included a flask with 10% sugar at 30 °C. How much gas did it produce?"),
                (["The high temperature harmed the yeast", "The flasks contained more sugar", "The yeast was too cold", "The sugar made the gas leak out"], 0, "Gas fell sharply above 30 °C, which fits heat damaging the living yeast. Sugar was the same in every flask.", "Interpreting results", "Which is the most likely explanation for the small amount of gas at 50 °C?"),
                (["Above about 10%, sugar was no longer the main thing limiting gas production", "Sugar stops yeast from working", "The yeast had run out of water", "The gas measurements must be wrong"], 0, "Doubling the sugar added only 2 mL, so something else (such as the amount of yeast) was now the limit.", "Interpreting results", "Increasing the sugar from 10% to 20% added only 2 mL of gas. This suggests that:"),
            ],
        },
        {
            "title": "Conflicting Viewpoints: The Green Lake",
            "paras": [
                "A small lake turns bright green every August because of a large growth of algae, called a bloom. Two students propose explanations.",
                "<b>Student 1:</b> The bloom is caused mainly by nutrients. Rain washes fertilizer from nearby farms into the lake, adding phosphorus, which algae need to grow. In years with heavy spring rain, more phosphorus reaches the lake and the bloom is larger. Reducing fertilizer runoff would prevent the bloom.",
                "<b>Student 2:</b> The bloom is caused mainly by temperature. Algae grow fastest in warm, still water, and August is the warmest, calmest month. The lake has always had enough phosphorus for some algae. In years with hotter summers, the bloom is larger. Reducing runoff would not prevent the bloom as long as summers stay hot.",
            ],
            "questions": [
                (["The lake turns green because of algae", "Fertilizer is the main cause of the bloom", "Temperature is the main cause of the bloom", "Reducing runoff would stop the bloom"], 0, "Both accept the observation; they disagree only about its cause.", "Viewpoints", "Both students would most likely agree that:"),
                (["The largest blooms happened in years with the heaviest spring rain, whatever the summer temperature", "The largest blooms happened in the hottest summers", "The lake had a bloom in a year with no runoff", "Algae grow faster in warm water"], 0, "Student 1 links bloom size to rain-driven runoff; this finding matches that and not temperature.", "Supporting evidence", "Which finding would most strongly support Student 1?"),
                (["A similar lake with no farms nearby also blooms in hot summers", "The bloom shrank after farms stopped using fertilizer", "Phosphorus levels rise after heavy rain", "The lake blooms more in rainy years"], 0, "A bloom without farm runoff points to temperature, not fertilizer.", "Supporting evidence", "Which finding would most strongly support Student 2?"),
                (["Still occur during hot summers", "Disappear completely", "Occur only in spring", "Become larger every year"], 0, "Student 2 says reducing runoff wouldn't prevent it \"as long as summers stay hot\".", "Predicting a viewpoint", "If all fertilizer runoff stopped, Student 2 would predict that the bloom would:"),
                (["Grow algae in tanks with equal phosphorus at different temperatures", "Grow algae in tanks with different amounts of phosphorus at the same temperature", "Count the farms near the lake", "Measure how green the lake is in winter"], 0, "To test temperature, vary temperature and hold phosphorus constant.", "Designing a test", "Which experiment would best test Student 2's explanation?"),
                (["Would not work as long as summers stay hot", "Would work better in hot summers", "Would make the bloom larger", "Is the same solution Student 2 proposes"], 0, "Student 2 says this directly about reducing runoff.", "Comparing viewpoints", "Student 1 suggests reducing fertilizer runoff. Student 2's view implies that this solution:"),
            ],
        },
        {
            "title": "Bouncing Balls",
            "paras": [
                "Students dropped the same rubber ball and measured how high it bounced.",
                "<b>Experiment 1:</b> The ball was dropped from 1.00 m onto four surfaces.",
                [["Surface", "Concrete", "Wood", "Carpet", "Grass"], ["Bounce height (m)", "0.80", "0.65", "0.30", "0.20"]],
                "<b>Experiment 2:</b> The ball was dropped onto concrete from four heights.",
                [["Drop height (m)", "0.50", "1.00", "1.50", "2.00"], ["Bounce height (m)", "0.40", "0.80", "1.20", "1.60"]],
            ],
            "questions": [
                (["Concrete", "Wood", "Carpet", "Grass"], 0, "0.80 m is the highest bounce in Experiment 1.", "Reading a value", "In Experiment 1, which surface produced the highest bounce?"),
                (["About 80%", "About 50%", "About 20%", "About 100%"], 0, "0.40/0.50, 0.80/1.00 and so on all equal 0.80.", "Calculations", "In Experiment 2, the bounce height was always about what percent of the drop height?"),
                (["2.00 m", "1.60 m", "2.50 m", "1.25 m"], 0, "80% of 2.50 m is 2.00 m.", "Prediction", "If the ball were dropped onto concrete from 2.50 m, the bounce height would most likely be:"),
                (["The drop height", "The surface", "The bounce height", "The ball's color"], 0, "Every Experiment 1 drop was from 1.00 m.", "Variables", "In Experiment 1, which variable was held constant?"),
                (["Softer surfaces absorb more of the ball's energy, producing lower bounces", "Harder surfaces absorb more energy", "The surface has no effect on bounce height", "The ball bounces higher from greater drop heights only on grass"], 0, "The soft surfaces (carpet, grass) gave the lowest bounces.", "Interpreting results", "Which hypothesis is most consistent with the results of Experiment 1?"),
                (["0.60 m", "0.30 m", "1.60 m", "2.00 m"], 0, "Carpet returned 0.30 of the drop height, so 2.00 × 0.30 = 0.60 m.", "Combining experiments", "Assuming the pattern of Experiment 2 also holds for carpet, a ball dropped from 2.00 m onto carpet would bounce to about:"),
            ],
        },
    ],
}

READING = [READING_1, READING_2]
SCIENCE = [SCIENCE_1, SCIENCE_2]
