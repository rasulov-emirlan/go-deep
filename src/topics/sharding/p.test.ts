import { it } from 'vitest'
import { compare } from '/home/user/go-deep/src/topics/sharding/ring'
it('p',()=>{for(const v of [1,10,100,200,1000]) for (const a of ['add','remove'] as const){const r=compare({vnodes:v,action:a,keys:200000});console.log(v,a,r.movedPct.toFixed(1),r.modPct.toFixed(1),r.maxOverMean.toFixed(2),r.cv.toFixed(1))}})
