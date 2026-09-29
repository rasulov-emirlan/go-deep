package main

type Config struct {
	Host string
	Port int
}

func NewGetter(load func() *Config) func() *Config {
	// your code here
	return nil
}
