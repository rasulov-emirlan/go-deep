package main

type Document struct {
	URL            string
	PubDate        uint64
	FetchTime      uint64
	Text           string
	FirstFetchTime uint64
}

type Processor struct {
	// your fields here
}

func NewProcessor() *Processor {
	return &Processor{}
}

func (p *Processor) Process(d Document) *Document {
	// your code here
	return nil
}
