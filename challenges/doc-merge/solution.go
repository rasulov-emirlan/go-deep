package main

import "sync"

type Document struct {
	URL            string
	PubDate        uint64
	FetchTime      uint64
	Text           string
	FirstFetchTime uint64
}

type versions struct{ first, last Document }

type Processor struct {
	mu   sync.Mutex
	docs map[string]versions
}

func NewProcessor() *Processor {
	return &Processor{docs: make(map[string]versions)}
}

func (p *Processor) Process(d Document) *Document {
	p.mu.Lock()
	defer p.mu.Unlock()

	v, seen := p.docs[d.URL]
	switch {
	case !seen:
		v = versions{first: d, last: d}
	case d.FetchTime < v.first.FetchTime:
		v.first = d
	case d.FetchTime > v.last.FetchTime:
		v.last = d
	default:
		return nil // duplicate or stale: nothing changes
	}
	p.docs[d.URL] = v

	return &Document{
		URL:            d.URL,
		PubDate:        v.first.PubDate,
		FetchTime:      v.last.FetchTime,
		Text:           v.last.Text,
		FirstFetchTime: v.first.FetchTime,
	}
}
