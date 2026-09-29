package main

func Unique[T comparable](in []T) []T {
	seen := make(map[T]struct{}, len(in))
	out := make([]T, 0, len(in))
	for _, v := range in {
		if _, ok := seen[v]; ok {
			continue
		}
		seen[v] = struct{}{}
		out = append(out, v)
	}
	return out
}
