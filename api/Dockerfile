FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY *.go ./
RUN CGO_ENABLED=0 go test ./... && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /api .

FROM scratch
COPY --from=build /api /api
USER 1000:1001
EXPOSE 8080
ENTRYPOINT ["/api"]
