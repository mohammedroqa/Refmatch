"""Compose RefMatch's stereo film soundtrack from the shared timing configuration."""
import json
import math
import random
import wave
from array import array
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VIDEO = json.loads((ROOT/'brand/tokens.json').read_text())['video']
RATE, DURATION = 48000, VIDEO['duration']
ENDING = VIDEO['sceneStarts']['ending']
N = round(RATE * DURATION)
left, right = array('f', [0]) * N, array('f', [0]) * N
rng = random.Random(42)

def tone(start, duration, frequency, volume, pan=0, attack=.015, decay=2.5):
    first = max(0, int(start * RATE))
    count = min(int(duration * RATE), N-first)
    for k in range(count):
        t = k/RATE
        envelope = min(1, t/attack) * math.exp(-decay*t) * min(1, (duration-t)/.15)
        sample = (math.sin(2*math.pi*frequency*t) + .18*math.sin(2*math.pi*frequency*2*t)) * volume * envelope
        left[first+k] += sample * math.sqrt((1-pan)/2)
        right[first+k] += sample * math.sqrt((1+pan)/2)

# Spacious D minor ninth bed, slowly blooming under the motion.
for frequency, pan in [(146.832,-.6),(174.614,.5),(220,-.25),(261.626,.7),(329.628,-.7)]:
    tone(0, ENDING+.6, frequency, .037, pan, .9, .085)

# Warm, restrained pulse and airy eighth-note ticks, 120 BPM.
for beat in range(int(ENDING/.5)):
    start = beat * .5
    if beat % 2 == 0:
        first=int(start*RATE)
        for k in range(min(int(.24*RATE),N-first)):
            t=k/RATE
            phase=2*math.pi*(48*t+55*.025*(1-math.exp(-t/.025)))
            val=math.sin(phase)*math.exp(-t*20)*min(1,t/.003)*.20
            left[first+k]+=val;right[first+k]+=val
    first=int((start+.25)*RATE)
    prev=0
    for k in range(min(int(.07*RATE),N-first)):
        noise=rng.uniform(-1,1)
        val=(noise-prev)*.014*math.exp(-k/RATE*65);prev=noise
        left[first+k]+=val*.6;right[first+k]+=val

# A short melodic pattern with quieter stereo echoes.
notes=[293.665,440,523.251,659.255,440,349.228,523.251,440]
for i in range(int((ENDING-.4)/.85)+1):
    f=notes[i % len(notes)]
    t=.12+i*.85
    tone(t,1.7,f,.095,(-.4 if i%2 else .4),.006,3.3)
    tone(t+.26,1.4,f,.025,(.7 if i%2 else -.7),.01,3.7)

# Subtle whooshes resolve into each scene change.
for end in (VIDEO['sceneStarts']['rank']+.12, VIDEO['sceneStarts']['explain']+.12, ENDING+.2):
    first=int((end-.32)*RATE)
    filtered=0
    for k in range(int(.56*RATE)):
        t=k/RATE
        filtered=.9*filtered+.1*rng.uniform(-1,1)
        envelope=(math.sin(math.pi*t/.56)**2)*.19
        val=filtered*envelope
        left[first+k]+=val*(1-t/.7);right[first+k]+=val*(.3+t/.7)
    tone(end,.9,73.416,.12,0,.004,5)

# Three-note sonic signature lands as the final mark appears.
for t,f,p in [(ENDING+.32,293.665,-.35),(ENDING+.46,440,.35),(ENDING+.60,587.33,0)]:
    tone(t,DURATION-t,f,.15,p,.008,1.25)
tone(ENDING+.32,DURATION-ENDING-.32,146.832,.10,0,.05,.8)

peak=max(max(abs(v) for v in left),max(abs(v) for v in right),.01)
gain=.82/peak
pcm=array('h')
for i in range(N):
    fade=min(1,i/(RATE*.015),(N-1-i)/(RATE*.32))
    pcm.extend((int(max(-1,min(1,left[i]*gain*fade))*32767),int(max(-1,min(1,right[i]*gain*fade))*32767)))
if __import__('sys').byteorder != 'little':
    pcm.byteswap()
out=ROOT/'video/refmatch-soundtrack.wav'
with wave.open(str(out),'wb') as wav:
    wav.setnchannels(2);wav.setsampwidth(2);wav.setframerate(RATE);wav.writeframes(pcm.tobytes())
print(f'Created {out.name}: original stereo composition, {DURATION} seconds, 48 kHz.')
