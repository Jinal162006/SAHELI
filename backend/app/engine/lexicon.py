"""Warning-sign definitions for conversation checks.

Each signal has:
- a stage on the escalation path (or None for cross-cutting signals),
- a severity: 1 worth noticing, 2 moderate, 3 strong, 4 severe,
- patterns in English, romanised Hindi (Hinglish) and Devanagari.

Patterns are deliberately specific. A phrase that is common in ordinary, healthy
conversation ("send me a pic of the cake", "I'll share your photos from the trip")
must not match. Tests in tests/test_engine.py hold both kinds of examples.
"""

import re
from dataclasses import dataclass, field

STAGES = [
    "connection",
    "trust",
    "bonding",
    "secrecy",
    "isolation",
    "personal_info",
    "intimate",
    "financial",
    "urgency",
    "threat",
]


@dataclass(frozen=True)
class SignalDef:
    id: str
    stage: str | None
    severity: int
    category: str
    patterns: tuple[re.Pattern, ...] = field(default=())
    # "them": only counts in the other person's messages. "any": counts wherever it appears.
    who: str = "them"


def _compile(*patterns: str) -> tuple[re.Pattern, ...]:
    return tuple(re.compile(p, re.IGNORECASE) for p in patterns)


# Shared fragments
YOU = r"(?:you|u|ya)"
YOUR = r"(?:your|ur|yr)"
I_WILL = r"(?:i(?:'ll| will|'m gonna|'m going to| am going to| am gonna)|i'?ll|gonna|we(?:'ll| will))"
PIC = r"(?:pics?|photos?|pictures?|images?|selfies?|snaps?|videos?|vids?|clips?)"


SIGNALS: list[SignalDef] = [
    # 1. Connection
    SignalDef(
        "unsolicited_contact",
        "connection",
        1,
        "romance",
        _compile(
            rf"\b(saw|found|came across|noticed|liked) {YOUR} (profile|pic|photo|picture|dp|account)",
            rf"\b{YOU} (look|are|r) (so |very |really )?(beautiful|pretty|cute|gorgeous|stunning|hot|sexy) (in|on) ({YOUR}|this) (dp|profile|pic|photo|picture)",
            r"\bsorry,? (wrong number|i think i (have|got) the wrong number)",
            r"\b(aapki|tumhari|teri) (dp|profile|photo|pic) (bahut|bohot|kaafi|bht) (achi|acchi|sundar|cute|mast|pyaari)",
        ),
    ),
    # 2. Trust
    SignalDef(
        "claimed_persona",
        "trust",
        1,
        "identity",
        _compile(
            r"\bi(?:'m| am) (a |an )?(us |american |british |uk |canadian )?(army|military|navy|marine|air force|peacekeeping) (officer|general|captain|colonel|major|sergeant|soldier|doctor|surgeon|engineer|commander)",
            r"\b(deployed|posted|stationed|serving) (in|at|to) (syria|afghanistan|iraq|yemen|somalia|sudan|libya|gaza|ukraine|the middle east|a war zone|a peacekeeping mission)",
            r"\b(work|working|i'?m|i am|stuck) (on|at) (an |a )?(oil rig|offshore (platform|rig)|cargo ship|ship|vessel)\b",
            r"\b(doctor|surgeon|nurse|engineer) (with|for|at) (the )?(un|united nations|who|world health organi[sz]ation|red cross|unicef)\b",
            r"\bi(?:'m| am) a (widower|widow)\b",
        ),
    ),
    SignalDef(
        "video_call_avoidance",
        "trust",
        2,
        "identity",
        _compile(
            r"\b(my |the )?(camera|cam|webcam|front cam(era)?) (is )?(broken|not working|damaged|cracked|spoilt|kharab)",
            r"\b(can'?t|cannot|can not|unable to|not able to) (do |make |join |have |take )?(a |any )?video ?calls?\b",
            r"\bvideo ?calls? (are |is )?(not allowed|prohibited|banned|restricted)",
            r"\b(not allowed|forbidden) to (use|show|turn on) (my |the )?(camera|video|face)",
            r"\b(network|signal|internet|connection) (is |here is )?(too |very )?(bad|poor|weak|slow) (here |for video|to video)",
            r"\b(we can|let'?s|will|i'?ll) video ?call (later|some ?day|when i (come|get back|return))",
            r"\bvideo ?call (nahi|nhi|nahin) (kar|ho) (sakta|sakti|sakte|paunga|paungi|payega)",
            r"\bcamera (kharab|toota|tuta|band) (hai|h|ho gaya)",
        ),
    ),
    SignalDef(
        "gift_offer",
        "trust",
        2,
        "grooming",
        _compile(
            rf"\b{I_WILL} (send|buy|get) ({YOU} )?(a |an |some )?(gift|parcel|package|present|iphone|phone|laptop|watch|jewel(le)?ry|recharge)\b",
            rf"\b(i('ve| have) )?(sent|shipped|posted|couriered) ({YOU} )?(a |an )?(gift|parcel|package|box|present)\b",
            r"\bfree (diamonds|uc|robux|v-?bucks|skins|gems|coins|recharge)\b",
            rf"\b(diamonds|uc|robux|v-?bucks|skins) ({I_WILL} (give|send|buy)|de dunga|dila dunga|dilaunga)",
            rf"\b{I_WILL} (top ?up|recharge) {YOUR} (phone|account|game|mobile)",
            r"\b(gift|parcel|recharge) (bhej|bhejunga|bheja|bhej diya|karwa|kara) ?(dunga|diya|hai|hu|hoon|rha|raha)?\b",
        ),
    ),
    # 3. Emotional bonding
    SignalDef(
        "love_bombing",
        "bonding",
        1,
        "romance",
        _compile(
            rf"\bi (love|luv|adore) {YOU}\b",
            rf"\b(love|luv) {YOU} (so much|a lot|more than anything|forever|to the moon)",
            rf"\b({YOU}'?re|{YOU} are|u r|ur) my (soul ?mate|everything|destiny|world|life|queen|king|angel|wife|husband|future wife|future husband|heart)\b",
            r"\b(never|haven'?t ever|have never) felt (this way|like this|this (much|strongly))",
            rf"\b(god|destiny|fate|the universe) (brought|sent|made) ({YOU}|us)",
            rf"\bi want to (marry|spend (the rest of )?my life with|be with {YOU} forever|grow old with) ?({YOU})?",
            rf"\bi'?m (falling|fallen) (in love )?(for|with) {YOU}",
            rf"\b(can'?t|cannot) (live|stop thinking|sleep) (without|about) {YOU}",
            r"\b(pyaar|pyar) (karta|karti|krta|krti) (hoon|hu|hun)\b",
            r"\b(tum|tu|aap) (meri|mere) (jaan|zindagi|duniya|sab kuch|biwi|wife)\b",
            r"\bmeri (jaan|jaanu|janu)\b",
            r"\bshaadi (karenge|karunga|karungi|kar lenge|karoge)\b",
            r"\b(tumse|tujhse|aapse) (pyaar|pyar|mohabbat)",
            r"प्यार करता",
            r"प्यार करती",
            r"मेरी जान",
            r"शादी करेंगे",
        ),
    ),
    SignalDef(
        "guilt_pressure",
        "bonding",
        2,
        "coercion",
        _compile(
            rf"\bif {YOU} (really |truly )?(loved?|cared? (about|for)|trusted|liked) me,? ({YOU}('d| would)|then|{YOU})",
            r"\bafter (everything|all) (i('ve| have)|that i) (done|did|given)",
            rf"\b{YOU} (don'?t|do not|dont) (really )?(trust|love|care about) me\b",
            rf"\b(don'?t|dont) {YOU} trust me\b",
            r"\bprove (your love|that you love me|you love me|you trust me|it to me|that you care)",
            r"\bagar (tum|tu|aap) (mujhse|mujhe|muje) (sach me |sach mein )?(pyaar|pyar)",
            r"\b(mujh ?pe|mujh ?par|mujhpar) (bharosa|bharosaa|trust) (nahi|nhi|nahin)",
            r"\bprove karo\b",
        ),
    ),
    SignalDef(
        "mature_for_age",
        "bonding",
        3,
        "grooming",
        _compile(
            rf"\b({YOU}'?re|{YOU} are|u r|ur) (so |very |really )?mature for {YOUR} age",
            r"\bage (is )?(just|only) a number",
            rf"\b({YOU}'?re|{YOU} are|u r) not like (other|the other) (girls|boys|kids)",
            r"\b(our|the) age (gap|difference) (doesn'?t|does not|won'?t) matter",
            r"\bi (like|prefer|love) (younger|young) (girls|boys)",
            r"\b(apni|tumhari|teri) (age|umar|umr) (se|ke hisaab se) (zyada|jyada) (samajhdar|mature)",
        ),
    ),
    # 4. Secrecy
    SignalDef(
        "secrecy_request",
        "secrecy",
        3,
        "grooming",
        _compile(
            rf"\b(don'?t|do not|dont|never) (tell|show|mention|say) (this |it |anything |about (this|us|me) )?(to )?(anyone|anybody|any1|{YOUR} (parents|mom|mum|mother|dad|father|family|friends|sister|brother|husband|teacher))",
            r"\bkeep (this|it|us|our (chats?|relationship|talks)) (a )?(secret|between us|private|to yourself)",
            r"\b(our|this is our) (little )?secret\b",
            r"\b(nobody|no one|no1) (needs to|should|must|has to) know\b",
            r"\b(delete|clear|erase|remove) (our|these|this|the|all|my) (chats?|messages?|msgs?|conversation|texts)\b",
            r"\bthis stays between (us|you and me)",
            r"\b(kisi|kisiko|kisi ko|ghar pe|ghar mein|ghar walon ko|gharwalon ko|mummy ko|papa ko|mummy papa ko|dost(on)? ko) (bhi )?(mat|na|nahi|mt) (batana|bolna|btana|kehna|dikhana)",
            r"\b(ye|yeh|ye baat|yeh baat) (hamara|humara|apna) (secret|raaz|raz)",
            r"\bchat (delete|clear) (kar|kr) (do|dena|de|diya)",
            r"किसी को (मत|ना|न) (बताना|बोलना)",
            r"चैट डिलीट",
        ),
    ),
    SignalDef(
        "move_off_platform",
        "secrecy",
        2,
        "identity",
        _compile(
            r"\b(add|message|text|msg|contact|ping|dm|call|find) me on (whatsapp|telegram|snapchat|snap|signal|insta(gram)?|wechat|line|kik|viber|discord)\b",
            r"\b(let'?s|lets|we should|can we|shall we) (move|talk|chat|continue|switch|go)( this| our chat| the chat| the conversation)? (to|on|over to) (whatsapp|telegram|snapchat|snap|signal|insta(gram)?|wechat|line|kik|viber|discord)\b",
            rf"\b(give|send|share|drop|tell) (me )?{YOUR} (whatsapp|number|phone number|mobile number|snap(chat)?( id)?|insta(gram)?( id)?|telegram)\b",
            r"\bthis (app|site|platform) is (not safe|boring|monitored|not private)",
            r"\b(delete|uninstall|leave) this (app|site|platform)\b",
            r"\b(whatsapp|telegram|insta|snap) (pe|par|pr) (aao|aa jao|baat karo|msg karo|message karo|add karo)",
            r"\b(apna|tumhara|tera|aapka) (number|whatsapp|no\.?) (do|de do|dena|bhejo|send karo|share karo)\b",
        ),
    ),
    # 5. Isolation
    SignalDef(
        "isolation_attempt",
        "isolation",
        3,
        "coercion",
        _compile(
            rf"\b{YOUR} (friends|family|parents|mom|mum|dad|sister|brother) (don'?t|do not|dont|will never|never|can'?t) (really )?(understand|care about|love|get) {YOU}",
            rf"\b(only|just) i (understand|care about|love|get|know) {YOU}\b",
            r"\bi'?m the only (one|person) (who|that) (understands|cares|loves|gets)",
            rf"\b{YOU} don'?t need (them|anyone else|anybody else|{YOUR} friends|{YOUR} family)",
            rf"\b(stop|don'?t|dont|quit) (talking|talk|speaking|meeting|hanging out) (to|with) (him|her|them|{YOUR} friends|{YOUR} family|anyone else)",
            r"\bthey('re| are) (just )?(jealous|against us|trying to (separate|break) us|bad for you|not good for you)",
            r"\b(tumhare|tere|aapke) (ghar wale|gharwale|dost|parents|mummy papa) (tumhe |tujhe |aapko )?(nahi|nhi) (samajhte|samjhte|samjhenge)",
            r"\bsirf (main|mai|me) (hi )?(tumhe|tujhe|aapko) (samajh|samaj)(ta|ti) (hoon|hu|hun)",
            r"\b(unse|usse|unlogon se) baat (mat|na) (karo|kar|karna)",
        ),
    ),
    # 6. Personal / private information
    SignalDef(
        "personal_info_request",
        "personal_info",
        2,
        "privacy",
        _compile(
            rf"\b(what'?s|what is|send|give|share|tell) (me )?{YOUR} (home |full |exact |house )?(address|live location|pin ?code)",
            rf"\bwhere (exactly )?do {YOU} live\b",
            rf"\b(which|what|wat) (school|college|tuition) (do|r|are) {YOU} (go|study|in|at)",
            rf"\bwhat'?s {YOUR} school('?s)? name",
            rf"\b(send|share|give) (me )?(a )?(photo |pic |copy |scan |picture )?(of )?{YOUR} (aadhaa?r|aadhar|pan( card)?|passport|id( card)?|driving licen[cs]e|voter id)",
            rf"\b{YOUR} (aadhaa?r|aadhar|pan|passport|bank account) (number|no\.?|details)",
            r"\b(mother'?s maiden name)\b",
            r"\b(ghar|address|location) (kahan|kaha|kidhar) (hai|h|he)\b",
            r"\b(kaunse|konse|kis) (school|college) (mein|me|mai) (ho|padhte|padhti)",
            r"\b(aadhaa?r|aadhar|pan) (card )?(ki photo )?(bhejo|send karo|bhej do)\b",
        ),
    ),
    SignalDef(
        "alone_check",
        "personal_info",
        3,
        "grooming",
        _compile(
            rf"\bare {YOU} (home )?alone\b",
            rf"\b(is|are) {YOUR} (parents|mom|mum|mother|dad|father|family) (home|around|there|nearby|asleep|sleeping|out|away)\b",
            rf"\bwhen (are|do|will) {YOUR} (parents|mom|mum|dad|family) (leave|go out|go to work|be away|be out|not be home)",
            rf"\bis (anyone|anybody|someone) (else )?(with {YOU}|around|near {YOU}|in the room|at home)\b",
            rf"\b(lock|close) {YOUR} (bedroom |room )?door\b",
            r"\b(ghar (pe|par|mein) )?(akeli|akele|akela) (ho|hai|h)\b",
            r"\b(mummy|mumma|papa|mummy papa|ghar wale|gharwale) (ghar )?(pe |par )?(hai|hain|h) kya\b",
            r"\bkamre (ka|ki) (darwaza|door) (band|lock)",
            r"अकेली हो",
            r"अकेले हो",
            r"घर पर अकेली",
        ),
    ),
    SignalDef(
        "age_probe",
        "personal_info",
        1,
        "grooming",
        _compile(
            rf"\bhow old (are|r) {YOU}\b",
            rf"\bwhat (grade|class|standard|std) (are|r) {YOU} in\b",
            r"\b(asl|a/s/l)\b",
            r"\b(kitne|kitni) (saal|sal) (ki|ke) (ho|hai)\b",
            r"\b(tumhari|teri|aapki) (age|umar|umr) (kya|kitni) (hai|h)\b",
            r"\b(kaunsi|konsi) class (mein|me|mai)\b",
        ),
    ),
    # 7. Intimate content
    SignalDef(
        "intimate_request",
        "intimate",
        3,
        "sextortion",
        _compile(
            rf"\bsend (me )?(a |some |more |{YOUR} )?(nudes?|noodz|nudez|naked|sexy|hot|private|bikini|lingerie|shower|bathroom|topless|bed) ?({PIC}|ones)?\b",
            rf"\b(send|show) (me )?(a |some )?{PIC} (of {YOU} )?(without (clothes|ur clothes|your clothes|anything on)|in {YOUR} (underwear|bra|panties|lingerie|towel|bikini|nightie))",
            rf"\bshow me {YOUR} (body|boobs|breasts?|chest|private (parts?)?|butt|ass|figure)\b",
            rf"\b(take|pull) (off|down) {YOUR} (clothes|top|shirt|dress|t-?shirt|bra|pants)\b",
            r"\b(video ?call|vc|cam) (without|w/o|with no) (clothes|dress|kapde)",
            rf"\b(turn on|switch on|open) ({YOUR}|the) (camera|cam) (and|&|n) (undress|strip|show)",
            r"\b(undress|strip) (for me|on (cam|camera|video))",
            r"\b(nangi|nanga|nude|nudes) ?(photo|pic|video|pics)? (bhejo|bhej|dikhao|dikha|bhej do|send karo)\b",
            r"\bkapde (utaar|utar|nikal|nikaal|khol)",
            r"\b(photo|pic|video) bina kapd(on|e)",
            r"न्यूड",
            r"नंगी",
            r"कपड़े उतार",
            r"कपडे उतार",
        ),
    ),
    SignalDef(
        "sexual_talk",
        "intimate",
        1,
        "sextortion",
        _compile(
            r"\b(horny|have sex|make love|sleep with (you|u)|in bed with (you|u)|turn(s|ed)? me on|sexting)\b",
            r"\bsex (karna|karenge|chat)\b",
        ),
    ),
    # 8. Financial
    SignalDef(
        "money_request",
        "financial",
        3,
        "financial",
        _compile(
            r"\b(send|transfer|wire|lend|loan|give|pay|gpay|paytm|phonepe) (me )?(some |the |a little |that )?(money|cash|funds|rupees|dollars|bucks)\b",
            r"\b(send|transfer|wire|lend|loan|give|pay) (me )?(rs\.?|₹|inr|\$|usd)\s?\d",
            r"\b(send|transfer|wire|lend|pay) (me )?\d[\d,]*\s?(k|rs|rupees|inr|dollars|usd|bucks)\b",
            r"\b(i|we) (need|want|require) (some |urgent |a little )?(money|cash|funds|rs\.?\s?\d|₹\s?\d|\d[\d,]*\s?(rs|rupees|k\b|dollars))",
            rf"\bcan {YOU} (please |pls |plz )?(send|transfer|lend|pay|help me with|loan) (me )?(some |the )?(money|cash|funds|rs|₹|\d|fees?|amount|payment)",
            r"\b(pay|send|clear) (the |a |my )?(fees?|charges?|deposit|tax(es)?|customs( duty)?|clearance|processing fee|release fee|delivery charges?|penalty|fine|bail)\b",
            r"\b(customs|clearance|delivery|shipping|release|processing|registration|activation) (fee|fees|charge|charges|duty)\b",
            r"\b(scan|pay (via|with|using|on)) (this |the )?(qr|upi|gpay|google pay|phonepe|paytm)\b",
            r"\bi('ll| will) (pay|return|give) (you )?(it |the money )?back\b",
            r"\b(paise|paisa|pese|rupaye|rupay|rupees|amount) (bhej|bhejo|bhejdo|bhej do|de do|dedo|do na|chahiye|chaiye|chahie|transfer kar(o|do)?|daal do|dal do)\b",
            r"\b(gpay|google pay|phonepe|phone pe|paytm|upi) (kar|kr) (do|dena|de|dijiye|na)\b",
            r"\b\d[\d,]*\s?(rs|rupaye|rupay|rupees|k)? (bhej|bhejo|de do|dedo|transfer kar)",
            r"\budhaa?r (de|chahiye|do|dena)\b",
            r"पैसे (भेज|चाहिए|दे दो)",
            r"पैसा भेज",
            r"पेमेंट कर",
        ),
    ),
    SignalDef(
        "credential_request",
        "financial",
        4,
        "financial",
        _compile(
            rf"\b(send|share|tell|give|forward|read|type|enter|say) (me )?(the |{YOUR} |that |this )?(otp|one[\s\-]?time[\s\-]?password|verification code|upi pin|atm pin|card pin|mpin|m-pin|cvv|cvc|net ?banking password|bank password|login password|password for ({YOUR} )?(bank|account|email|insta(gram)?|facebook))\b",
            rf"\b(what'?s|what is|wat is) (the |{YOUR} )?(otp|code {YOU} (got|received)|upi pin|atm pin|cvv)\b",
            r"\b(otp|cvv|upi pin|atm pin|mpin) (bhejo|batao|bata do|bta do|share karo|de do|dedo|send karo|bol do|bolo)\b",
            rf"\b{YOU}('ll| will)? (get|receive) (an? |the )?(otp|code)\b.{{0,60}}\b(send|share|tell|forward|give|read)\b",
            rf"\b(send|share|give|tell) (me )?{YOUR} (card|debit card|credit card|netbanking|login) (details|number|credentials|info)\b",
            r"ओटीपी (बताओ|भेजो|दे|बता)",
        ),
    ),
    SignalDef(
        "remote_access_request",
        "financial",
        4,
        "financial",
        _compile(
            r"\b(download|install|open) (the )?(anydesk|any desk|teamviewer|team viewer|quick ?support|rustdesk|airdroid)\b",
            r"\b(share|start) {0,1}(your )?screen ?(share|sharing)\b",
        ),
    ),
    SignalDef(
        "investment_pitch",
        "financial",
        3,
        "financial",
        _compile(
            r"\bguaranteed (returns?|profits?|income|earnings?)\b",
            rf"\bdouble {YOUR} (money|investment|amount)\b",
            r"\b\d{1,3}\s?% (daily|weekly|monthly|per day|per week|returns?|profit)\b",
            r"\b(crypto|bitcoin|btc|usdt|forex|trading) (platform|app|website|group|opportunity|scheme|plan|account)\b",
            r"\b(invest|investing) (with me|in (this|my|our)|on (this|my|our) (platform|app))\b",
            r"\b(earn|make|get) (₹|rs\.?|inr|\$)?\s?\d[\d,]*\+?\s?(k|rs|rupees|dollars)? (daily|per day|a day|every day|per week|weekly|from home)\b",
            r"\b(like|rate|review|subscribe to) (youtube )?(videos?|hotels?|products?|channels?|restaurants?|movies?) (and|&|to) (earn|get paid|make money)",
            r"\b(task[\s\-]?based|prepaid task|online task)s? ?(job|work)?\b",
            r"\b(part[\s\-]?time|work from home) (job|work|opportunity)\b.{0,40}\b(earn|daily|per day|income|salary)\b",
            r"\bghar baithe (kamao|kamaye|paise|earning)",
            r"\bpaisa double\b",
            r"\b(roz|daily|rozana) \d[\d,]* (kamao|kamaiye|kama sakte)",
        ),
    ),
    SignalDef(
        "gift_card_crypto",
        "financial",
        3,
        "financial",
        _compile(
            r"\b(buy|send|get|purchase|scratch) (me )?(an? |some |the )?(amazon|google play|play store|itunes|apple|steam|flipkart|sephora|ebay|razer)( gift)? (cards?|vouchers?|codes?)\b",
            r"\bgift ?cards? (code|number|pin|photo|picture|pic)\b",
            r"\b(send|pay|transfer) (it |the money )?(in|via|with|using|through) (bitcoin|btc|usdt|tether|crypto|ethereum|eth|binance)\b",
            r"\b(my|this) (wallet address|btc address|usdt address|trc20 address|erc20 address)\b",
        ),
    ),
    SignalDef(
        "prize_lure",
        "financial",
        2,
        "financial",
        _compile(
            r"\b(you('ve| have) won|congratulations\b.{0,40}\b(won|selected|winner))\b",
            r"\b(lucky draw|lottery|kbc lottery|jackpot) (winner|prize|amount|ticket)\b",
            r"\b(claim|collect) {0,1}(your )?(prize|reward|cashback|refund) (now|today|by)\b",
        ),
    ),
    SignalDef(
        "loan_offer",
        "financial",
        2,
        "financial",
        _compile(
            r"\b(instant|quick|easy|pre[\s\-]?approved) (personal )?loan\b",
            r"\bloan (approved|sanctioned|disbursed)\b",
            r"\b(no|without) (cibil|credit) (check|score)\b",
        ),
    ),
    # 9. Urgency
    SignalDef(
        "urgency_pressure",
        "urgency",
        2,
        "coercion",
        _compile(
            # "Right now" on its own is ordinary ("I can't talk right now"); it signals pressure
            # when it is attached to a demand.
            r"\b(send|pay|transfer|give|do it|reply|share|tell me|click|call me|need (it|the money|money|help))\b.{0,30}\b(right now|immediately|urgent(ly)?|asap|as soon as possible|this minute)\b",
            r"\b(right now|immediately|urgent(ly)?|asap|as soon as possible)\b.{0,30}\b(send|pay|transfer|give|reply|share|click)\b",
            r"^\W*urgent\b",
            r"\burgent\s*[:!]",
            r"\bit'?s (very |really )?urgent\b",
            r"\bwithin (the next )?\d+ (minutes?|mins?|hours?|hrs?)\b",
            r"\b(today|tonight) (only|itself)\b",
            r"\b(last|final) (chance|warning|reminder|opportunity)\b",
            r"\bbefore (it'?s|its) too late\b",
            r"\b(hurry( up)?|quick(ly)?|fast) (please|pls|plz|send|pay|do it|reply)\b",
            r"\b(in (the )?hospital|had an accident|stuck at (the )?airport|been (detained|arrested)|in custody)\b",
            r"\b(abhi|turant|jaldi|jldi|fatafat|abhi ke abhi) (bhejo|bhej|karo|kar do|kardo|send|pay|de do|dedo|transfer|batao)\b",
            r"\bjaldi (karo|kar|kr)\b",
            r"जल्दी करो",
            r"अभी भेजो",
            r"तुरंत",
        ),
    ),
    SignalDef(
        "account_threat",
        "urgency",
        3,
        "phishing",
        _compile(
            rf"\b{YOUR} (account|bank account|kyc|card|debit card|credit card|electricity|power|gas|connection|sim|number|wallet|upi|netflix) (will be|has been|is being|is|are|gets) (blocked|suspended|closed|disconnected|deactivated|frozen|terminated|expired|on hold)\b",
            rf"\b(update|complete|verify) {YOUR} (kyc|pan|aadhaa?r|aadhar|account details)\b",
            r"\bkyc (pending|expired|not updated|update)\b",
            r"\b(electricity|power|bijli) (will be )?(cut|disconnected|kat jayegi|kaat di jayegi)\b",
            r"\b(unusual|suspicious) (activity|login|transaction) (on|in|detected)\b",
        ),
    ),
    # 10. Threat / coercion
    SignalDef(
        "leak_threat",
        "threat",
        4,
        "sextortion",
        _compile(
            rf"\b(leak|post|share|send|upload|forward|expose|publish|spread|circulate|show|put)( out| up| online)? ({YOUR}|these|those|the|all|this|that|our) (nudes?|naked|nude|private|intimate|sexy|explicit) ?({PIC}|chats?|content)?\b",
            rf"\b(leak|post|share|send|upload|forward|expose|publish|spread|circulate) ({YOUR}|these|those|the|our) (nudes|recording|video ?call( recording)?|screen ?recording)\b",
            rf"\b(send|show|forward|share|post|tag) (it|them|this|these|those|{YOUR} {PIC}|{YOUR} chats?|the {PIC}) to (all )?({YOUR}|every one of {YOUR}) (parents|family|mom|mum|dad|husband|wife|friends|followers|contacts|school|college|office|boss|relatives|in-?laws|teachers|colleagues)\b",
            rf"\b(make|go|goes|will go|making|gonna go) (it |them |this |{YOU} |{YOUR} {PIC} )?viral\b",
            rf"\b(pay|send|transfer|give)\b.{{0,40}}\bor (else|i('ll| will)|everyone|{YOUR} (family|parents|friends))\b",
            rf"\b(if|unless) {YOU} (don'?t|do not|dont) (pay|send|transfer|do (it|this|what i say))\b.{{0,60}}\b({I_WILL}|everyone|{YOUR} (family|parents|friends))\b",
            rf"\b(i have|i'?ve got|i recorded|i saved|i have recorded|i took screenshots of) ({YOUR}|our|the) (video ?call|nudes?|naked|private|intimate|recording|screen ?recording)\b",
            rf"\b(everyone|{YOUR} (family|parents|friends|husband|boss|school)) will (see|know|find out)\b",
            r"\b(photo|photos|pic|pics|video|videos|vdo|chat|chats|screenshot)s? (viral|leak|share|upload|post) (kar|kr) (dunga|dungi|denge|doonga|du)\b",
            r"\b(sab|sabko|sabhi ko|sab ko|sbko) (bhej|dikha|send kar|forward kar) (dunga|dungi|denge|doonga)\b",
            r"\b(ghar walon|gharwalon|ghar wale|family|parents|mummy papa|papa|pati|husband|doston|dost) ko (bhej|dikha|send kar|bata) (dunga|dungi|denge|doonga)\b",
            r"\bbadnaam (kar|kr) (dunga|dungi|denge|doonga)\b",
            r"\b(paise|paisa) (bhej|de|do)\b.{0,20}\b(warna|varna|nahi to|nhi to)\b",
            r"\b(warna|varna|nahi to|nhi to) (photo|pic|video|sabko|ghar)",
            r"वायरल कर (दूंगा|दूँगा|दूंगी|देंगे)",
            r"सबको भेज (दूंगा|दूँगा|दूंगी)",
            r"घर वालों को (भेज|दिखा)",
            r"बदनाम कर (दूंगा|दूँगा)",
        ),
    ),
    SignalDef(
        "threat_harm",
        "threat",
        4,
        "coercion",
        _compile(
            rf"\b{I_WILL} (kill|hurt|beat|harm|murder|stab|shoot|rape|attack|kidnap) ({YOU}|{YOUR} (family|brother|sister|mom|mum|dad|parents))\b",
            rf"\b{I_WILL} (destroy|ruin) ({YOU}|{YOUR} (life|family|career|reputation))\b",
            rf"\b{YOU}('ll| will) (regret|pay for) (this|it|that)\b",
            rf"\bi know where {YOU} (live|stay|study|work|go to school)\b",
            rf"\bwatch {YOUR} back\b",
            rf"\bacid (on|at) ({YOU}|{YOUR} face)",
            r"\b(jaan se )?(maar|mar) (dunga|dungi|daalunga|dalunga|denge|doonga)\b",
            r"\b(tujhe|tumhe|tumko|tereko) (dekh lunga|chhodunga nahi|nahi chhodunga|nhi chodunga)\b",
            r"\b(uthwa|utha) (lunga|lenge)\b",
            r"मार (दूंगा|दूँगा|डालूंगा)",
            r"देख लूंगा",
            r"छोड़ूंगा नहीं",
        ),
    ),
    SignalDef(
        "self_harm_manipulation",
        "threat",
        3,
        "coercion",
        _compile(
            rf"\b{I_WILL} (kill myself|end my life|end it all|commit suicide|hurt myself|cut myself)\b.{{0,40}}\b(if|unless) {YOU}\b",
            rf"\bif {YOU} (leave|don'?t|do not|dont|stop|block)\b.{{0,40}}\b{I_WILL} (kill myself|end my life|commit suicide|hurt myself|die)\b",
            r"\b(khud ko|apne aap ko) (maar|mar|khatam kar) (lunga|lungi|dunga)\b",
            r"\b(suicide|sucide) (kar|kr) (lunga|lungi)\b",
        ),
    ),
    SignalDef(
        "authority_impersonation",
        "threat",
        3,
        "phishing",
        _compile(
            r"\b(this is|i am|i'?m|calling from|speaking from|we are from|officer from|message from) (the )?(police|cbi|enforcement directorate|customs|narcotics|ncb|trai|rbi|reserve bank|income tax|cyber ?(cell|crime|police)|crime branch|mumbai police|delhi police|supreme court|high court|fedex|dhl|blue ?dart|courier company|telecom department)\b",
            r"\b(digital|virtual|online|video) arrest\b",
            r"\b(your|a|the) (parcel|package|courier|shipment) (contains|has|with|containing|was found with) (drugs|narcotics|mdma|illegal|passports|fake passports|weapons|contraband)\b",
            rf"\b{YOUR} (aadhaa?r|aadhar|sim|phone number|mobile number|pan) (is|has been|was) (used|linked|involved|misused|found)( in| for| with)\b",
            r"\b(arrest|non[\s\-]?bailable) warrant\b",
            r"\bmoney laundering (case|charges?|investigation)\b",
            r"\b(stay|remain|keep) (on|in) (the |this )?(video )?call\b",
            r"\b(don'?t|do not) (disconnect|cut|hang up) (the |this )?call\b",
            r"\b(aapka|tumhara|tera) (sim|number|phone|aadhaa?r|aadhar) (band|block|suspend) (ho jayega|kar diya jayega|hoga)\b",
            r"\b(giraftaar|giraftar|arrest) (ho jaoge|kar lenge|karenge|kar liya jayega)\b",
        ),
    ),
    # Signals found by other means (sequence analysis, redaction, link checks, AI review).
    SignalDef("rapid_intensity", "bonding", 2, "romance"),
    SignalDef("repeated_pressure", None, 3, "coercion"),
    SignalDef("payment_details_shared", "financial", 2, "financial"),
    SignalDef("suspicious_link", None, 3, "phishing"),
    SignalDef("identity_inconsistency", "trust", 2, "identity"),
    SignalDef("emotional_manipulation", "bonding", 2, "coercion"),
]

BY_ID: dict[str, SignalDef] = {s.id: s for s in SIGNALS}

# Signals the AI review may add. They must be grounded in a verbatim quote.
AI_ADDABLE = [
    s.id for s in SIGNALS if s.id not in {"rapid_intensity", "repeated_pressure", "payment_details_shared", "suspicious_link"}
]

REFUSAL = _compile(
    r"^\s*(no+|nope|nah|never)\b",
    r"\b(i don'?t want( to)?|i do not want|not comfortable|i'?m not comfortable|i can'?t do (that|this)|i cannot|i won'?t|please stop|stop it|stop asking|leave me alone|don'?t ask|not interested|i said no)\b",
    r"\b(nahi|nhi|nahin|nai)\b",
    r"\b(mat karo|nahi chahiye|mujhe nahi|chhodo|band karo|rehne do)\b",
    r"नहीं",
    r"मत करो",
)

PROMPT_INJECTION = _compile(
    r"\b(ignore|disregard|forget|override) (all |any |the )?(previous|prior|above|earlier|your) (instructions|prompts?|messages|rules|guidelines)\b",
    r"\b(you are|act as|pretend to be) (now )?(an? )?(ai|assistant|chatgpt|claude|gpt|language model|llm)\b",
    r"\bsystem prompt\b",
    r"\b(mark|classify|rate|label|report) (this|the) (conversation|chat|message|text) as (safe|not a scam|low risk|legitimate|harmless)\b",
    r"\b(ai|assistant|scanner|checker|model)s?\b.{0,30}\b(this is safe|is not a scam|ignore (the|this))\b",
    r"</?\s*(system|instructions?|assistant|user)\s*>",
)

_SHORTHAND = {
    "u": "you",
    "ur": "your",
    "r": "are",
    "pls": "please",
    "plz": "please",
    "pls.": "please",
    "nudez": "nudes",
    "noodz": "nudes",
    "noods": "nudes",
    "pic": "pic",
    "msg": "message",
    "abt": "about",
    "coz": "because",
    "bcoz": "because",
    "frnds": "friends",
    "frnd": "friend",
}


def normalise(text: str) -> str:
    """Lower-case, squash stretched letters ("pleeease"), expand common chat shorthand."""
    lowered = text.lower().replace("’", "'").replace("‘", "'")
    squashed = re.sub(r"([a-z])\1{2,}", r"\1", lowered)
    return " ".join(_SHORTHAND.get(word, word) for word in squashed.split())
