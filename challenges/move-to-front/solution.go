package main

func MoveToFront(items []string, target string) {
	w := 0
	for i, it := range items {
		if it == target {
			items[w], items[i] = items[i], items[w]
			w++
		}
	}
}
