package main

import "unicode"

func IsPalindrome(s string) bool {
	r := []rune(s)
	i, j := 0, len(r)-1
	for i < j {
		switch {
		case !unicode.IsLetter(r[i]):
			i++
		case !unicode.IsLetter(r[j]):
			j--
		case unicode.ToLower(r[i]) != unicode.ToLower(r[j]):
			return false
		default:
			i++
			j--
		}
	}
	return true
}
