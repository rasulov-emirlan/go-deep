package main

import (
	"sync"
	"sync/atomic"
)

type Config struct {
	Host string
	Port int
}

type Lazy struct {
	load func() (*Config, error)
	mu   sync.Mutex
	v    atomic.Pointer[Config]
}

func NewLazy(load func() (*Config, error)) *Lazy {
	return &Lazy{load: load}
}

func (l *Lazy) Get() (*Config, error) {
	if c := l.v.Load(); c != nil {
		return c, nil
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	if c := l.v.Load(); c != nil {
		return c, nil
	}
	c, err := l.load()
	if err != nil {
		return nil, err
	}
	l.v.Store(c)
	return c, nil
}
