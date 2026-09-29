package main

import "sync"

type Config struct {
	Host string
	Port int
}

func NewGetter(load func() *Config) func() *Config {
	return sync.OnceValue(load)
}
