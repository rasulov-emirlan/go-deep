package main

func ProductExceptSelf(in []int) []int {
	out := make([]int, len(in))
	prefix := 1
	for i, v := range in {
		out[i] = prefix
		prefix *= v
	}
	suffix := 1
	for i := len(in) - 1; i >= 0; i-- {
		out[i] *= suffix
		suffix *= in[i]
	}
	return out
}
