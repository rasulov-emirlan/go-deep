package main

import (
	"runtime"
	"sync/atomic"
)

type Mutex struct {
	locked atomic.Bool
}

func (m *Mutex) Lock() {
	for !m.locked.CompareAndSwap(false, true) {
		runtime.Gosched()
	}
}

func (m *Mutex) Unlock() {
	if !m.locked.CompareAndSwap(true, false) {
		panic("unlock of unlocked mutex")
	}
}

func (m *Mutex) TryLock() bool {
	return m.locked.CompareAndSwap(false, true)
}
