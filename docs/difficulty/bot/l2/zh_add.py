# Append the level-2 expansion strings to src/i18n/zh.ts (idempotent: replaces an earlier block).
import re
p='src/i18n/zh.ts'
s=open(p).read()
ZH = {
 # creatures
 'Megaphone Crab': '喇叭蟹',
 'Its shell is OPEN — SHOUT into it now!': '它的壳盖打开了——现在对着它大喊！',
 'It’s on its back — spray it, then TAG IT!': '它四脚朝天了——喷它，然后盖上涂鸦！',
 'Wait for the lid to open, then SHOUT': '等它的盖子打开，再大喊',
 'CAUGHT IT!': '接住了！',
 'BACKFIRE!': '回火！',
 'CLANG!': '铛！',
 'RIGHT BACK AT YOU!': '还给你！',
 'Fog Jelly': '雾水母',
 'You see right through its fog — paint its glowing heart!': '你看穿了它的雾——喷它发光的心！',
 'Paint gets lost in its fog. Aim with your Eye on (right-click / Z) to see through it': '颜料会消失在它的雾里。戴上眼睛瞄准（右键 / Z）就能看穿',
 'LOST IN THE FOG!': '消失在雾里了！',
 'The Red Gramophone': '红色留声机',
 'THE RED GRAMOPHONE': '红色留声机',
 'The record’s scratched — it’s DAZED! Spray it, then TAG IT! (E)': '唱片刮花了——它晕了！喷它，然后盖上涂鸦！（E）',
 'It’s breathing in — HOLD X and BIG SHOUT into its horn!': '它在吸气——按住 X，对着它的喇叭怒吼！',
 'The tonearm sweeps the floor — JUMP it!': '唱臂扫过地面——跳过去！',
 'The horn’s on you — step out of the pink cone': '喇叭对准你了——走出粉色扇形',
 'A ring rolls over the floor — JUMP it!': '一道圆环在地上滚过来——跳过去！',
 'The Red Pen scratches its record — get ready': '红笔在它的唱片上划了一道——准备好',
 'The music shakes your paint off. Wait for it to breathe in, then BIG SHOUT into the horn': '音乐把你的颜料震掉了。等它吸气，再对着喇叭怒吼',
 'TOO QUIET!': '太小声了！',
 'SKRRRTCH!': '刺啦——！',
 'SHAKEN OFF!': '震掉了！',
 'LOUDER!': '再大声点！',
 'SCRATCH!': '刮！',
 'SHHHHHH!': '嘘————！',
 # the district
 'BANDSTAND PIER': '乐台栈桥',
 'Bandstand Pier': '乐台栈桥',
 'The Bandstand': '乐台',
 'ECHO GALLERY': '回声廊',
 'Echo Gallery': '回声廊',
 'Fog Lamp': '雾灯',
 'On a stump in the fog, off the hidden walkway': '在雾里的木桩上，隐藏栈道的岔路尽头',
 'On top of the crates on the West Landing': '在西平台的木箱堆顶上',
 'Win the Echo Gallery: shout 8 of the 10 pop-up horns': '赢下回声廊：10 个弹出的喇叭喊中 8 个',
 'Ride the carousel… (well, walk round it)': '坐旋转木马……（好吧，绕着它走一圈）',
 'Repaint the Red Gramophone': '给红色留声机重新上色',
 'HONK!': '嘟！',
 'LOST & FOUND': '失物招领',
 'THE HUSH’S LULLABY': '「寂静」的摇篮曲',
 '“Lost & Found: one Eye, unclaimed… oh, you have one already!”': '“失物招领：一只眼睛，没人认领……哦，你已经有一只了！”',
 'The Lost & Found coughs up a lost EYE sticker! Walk over it, then hold Q to purify it.': '失物招领咳出了一张丢失的眼睛贴纸！走过去捡起来，再按住 Q 净化它。',
 'ECHO GALLERY! Horns pop up one at a time — SHOUT at each before it sinks. {need} of {n} wins a crown.': '回声廊！喇叭一个个弹出来——在它缩回去前对它大喊。喊中 {n} 个里的 {need} 个就赢一顶皇冠。',
 '{hits}/{n}! The Echo Gallery’s crown rises out of the floor.': '{hits}/{n}！回声廊的皇冠从地板里升起来了。',
 '{hits}/{n} — not quite. Step off the gallery and back on to try again.': '{hits}/{n}——差一点。走下回声廊再走上去，重新挑战。',
 # the sky moment
 'The RED PEN!': '红笔！',
 'It crosses the Bell Bridge out!': '它把钟桥划掉了！',
 '…and the old pier gate swings open behind the clock tower.': '……钟楼后面的老栈桥大门晃开了。',
 'The Red Pen’s X comes off the Bell Bridge!': '红笔画的叉从钟桥上掉了！',
 # the director
 'MEGAPHONE CRAB: its lid stays shut — shout at it then and it CATCHES your shout and throws it back. Wait for the lid to flip open, then SHOUT into it!': '喇叭蟹：它的盖子平时关着——这时对它大喊，它会接住你的喊声再扔回来。等盖子翻开，再对着它大喊！',
 'FOG JELLY: its fog swallows paint, paint drops and even the walkway. Put your Eye on and AIM (right-click / Z) to see right through it.': '雾水母：它的雾会吞掉颜料、颜料滴，连栈道都看不见。戴上眼睛瞄准（右键 / Z）就能看穿它。',
 'It CAUGHT your shout and threw it back! Shout only while its lid is OPEN (pink throat showing).': '它接住你的喊声又扔回来了！只在它盖子打开（露出粉色喉咙）时大喊。',
 'LOST IN THE FOG! Put your Eye on and AIM (right-click / Z): True Sight sees through the fog.': '消失在雾里了！戴上眼睛瞄准（右键 / Z）：真视能看穿雾。',
 'LOST IN THE FOG! You need an EYE to see through it — SHOUT at the Lost & Found bell on the ticket booth.': '消失在雾里了！你需要一只眼睛才能看穿——对售票亭上的失物招领铃大喊。',
 'The Red Pen scratches an X into its record — LOUDER! And a crab scuttles in.': '红笔在它的唱片上划了个叉——更响了！还爬来了一只螃蟹。',
 'Too quiet — it swallowed that. HOLD X until the ring glows, then let go into its horn: BIG SHOUT!': '太小声——被它吞掉了。按住 X 直到圆环发亮，再对着喇叭松开：怒吼！',
 'Guardian {n}/3 awake — but the RED PEN crossed out the Bell Bridge! The clock’s BONG opened the old pier gate behind the tower: go and find who’s playing the Hush’s lullaby.': '守护者 {n}/3 醒了——可是红笔把钟桥划掉了！钟声震开了钟楼后面的老栈桥大门：去找出是谁在放「寂静」的摇篮曲。',
 'It plays the Hush’s lullaby for the Red Pen, and the music shakes paint off. When it BREATHES IN, hold X and BIG SHOUT into its horn!': '它替红笔放着「寂静」的摇篮曲，音乐会把颜料震掉。它吸气的时候，按住 X 对着喇叭怒吼！',
 'The Bell Bridge is down — cross to the lighthouse on the headland! (Shortcut: the stair off the bandstand drops to the Ticket Yard.)': '钟桥放下来了——过桥去海岬上的灯塔！（近路：乐台边的楼梯直通售票场。）',
 'WAI fell into the fog — redrawn at the pier’s spray can. Aim with your Eye on (right-click / Z) to see the walkway, or lend your Eye to the Fog Lamp.': 'WAI 掉进雾里了——在栈桥的喷漆罐重画。戴上眼睛瞄准（右键 / Z）就能看见栈道，也可以把眼睛借给雾灯。',
 'WAI fell into the fog — redrawn at the pier’s spray can. Get an Eye first: SHOUT at the Lost & Found bell on the ticket booth.': 'WAI 掉进雾里了——在栈桥的喷漆罐重画。先去拿一只眼睛：对售票亭上的失物招领铃大喊。',
 'The pier is broken! A walkway zigzags over the gap, hidden in the jellies’ fog. Aim with your Eye on to see it — or lend your Eye to the Fog Lamp.': '栈桥断了！一条之字形的栈道横过缺口，藏在水母的雾里。戴上眼睛瞄准就能看见——或者把眼睛借给雾灯。',
 'A sketched spring! Spray it full to make it real — then jump on it to sail over the barricade onto the bandstand.': '一个草图弹簧！把它喷满变成真的——再跳上去，越过路障飞上乐台。',
 'Back in the Ticket Yard. Through the gate, round the clock tower, and over the Bell Bridge!': '回到售票场了。穿过大门，绕过钟楼，走过钟桥！',
 'TRUE SIGHT: you see the walkway through the fog!': '真视：你透过雾看见了栈道！',
 'Listen to the clock…': '听，钟声……',
 'The Red Pen crossed out the Bell Bridge. Go round behind the clock tower: the old pier gate is open': '红笔划掉了钟桥。绕到钟楼后面：老栈桥的大门开了',
 'Bandstand Pier! Head west along the pier — the music comes from the bandstand': '乐台栈桥！沿着栈桥往西走——音乐是从乐台传来的',
 'You’ll need an Eye to see through the fog ahead — SHOUT at the Lost & Found bell on the ticket booth': '前面的雾要用眼睛才能看穿——对售票亭上的失物招领铃大喊',
 'Aim with your Eye on (right-click / Z) to see the hidden walkway — or lend your Eye to the Fog Lamp': '戴上眼睛瞄准（右键 / Z）就能看见隐藏的栈道——或者把眼睛借给雾灯',
 'You need an Eye to see the walkway in the fog — SHOUT at the Lost & Found bell on the ticket booth': '要看见雾里的栈道需要一只眼睛——对售票亭上的失物招领铃大喊',
 'Jump on the spring to sail over the barricade onto the bandstand': '跳上弹簧，越过路障飞上乐台',
 'Paint the sketched spring by the barricade full, then jump on it': '把路障旁的草图弹簧喷满，再跳上去',
 'Follow the pier round to the carousel — the bandstand is beyond it': '沿着栈桥绕到旋转木马——乐台就在它后面',
}
start = '  // ── level-2 expansion (Bandstand Pier) ──\n'
if start in s:
    a = s.index(start)
    b = s.index('  // ── end level-2 expansion ──\n') + len('  // ── end level-2 expansion ──\n')
    s = s[:a] + s[b:]
body = start
for k, v in ZH.items():
    assert "'" not in k and "'" not in v, k
    body += f"  '{k}': '{v}',\n"
body += '  // ── end level-2 expansion ──\n'
i = s.rindex('};')
s = s[:i] + body + s[i:]
open(p, 'w').write(s)
print(len(ZH), 'strings')
