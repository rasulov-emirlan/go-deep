package main

type Config struct {
	Host string
	Port int
}

type Lazy struct {
	// your fields
}

func NewLazy(load func() (*Config, error)) *Lazy {
	// your code here
	return &Lazy{}
}

func (l *Lazy) Get() (*Config, error) {
	// your code here
	return nil, nil
}
