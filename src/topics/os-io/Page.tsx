import { Section } from '../../components/Lab'
import { Flow } from '../../components/Flow'
import { NextTopic, TopicHero } from '../../components/TopicShell'
import { TopQuestions } from '../../bank/TopQuestions'
import devops from '../../bank/cats/devops.json'
import goroutines from '../../bank/cats/goroutines-scheduler.json'
import databases from '../../bank/cats/databases.json'
import { descriptors, epollScale, ladders, layers, netpollFile, writeCache, zeroCopy } from './flows'

const toc = [
  { id: 'wait', label: 'Three ways to wait' },
  { id: 'go', label: 'Go and files' },
  { id: 'cache', label: 'write() is a promise' },
  { id: 'copies', label: 'Copies & descriptors' },
]

export default function OsIoPage() {
  return (
    <>
      <TopicHero
        slug="os-io"
        title="I/O: page cache &amp; epoll"
        lead="Waiting for I/O comes in three styles. Files are cached in RAM first, so a successful write is only a promise."
        toc={toc}
      />

      <Section id="wait" n="01" kicker="Blocking · readiness · completion" title="Three ways to wait for I/O">
        <p>Every model answers one question: who waits, and who does the work. Read the ladders left to right: app, kernel, device.</p>
        <Flow title="Blocking, epoll, io_uring" def={ladders} />
        <p>epoll wins because the kernel remembers your list of sockets between calls.</p>
        <Flow title="Why epoll scales" def={epollScale} />
      </Section>

      <Section id="go" n="02" kicker="netpoller · regular files" title="Go parks sockets but blocks a thread on files">
        <p>Go hides epoll behind blocking-looking calls. That trick works for sockets and pipes, and not for files on disk.</p>
        <Flow title="A socket read, then a file read" def={netpollFile} />
      </Section>

      <Section id="cache" n="03" kicker="page cache · fsync" title="write() is a promise to the page cache">
        <p>File I/O goes through RAM, so a write can return long before anything is on disk. fsync is how you ask for more.</p>
        <Flow title="From write() to durable" def={writeCache} />
        <Flow title="Where bytes wait, and what fsync misses" def={layers} />
      </Section>

      <Section id="copies" n="04" kicker="sendfile · splice · fds" title="Copies and descriptors">
        <p>Copying a file to a socket through your own buffer wastes a trip. The kernel can skip it, if Go lets it.</p>
        <Flow title="File to socket: how many copies" def={zeroCopy} />
        <Flow title="fd, open file description, inode" def={descriptors} />
      </Section>

      <Section id="asked" n="05" kicker="Real interviews" title="Asked in real interviews">
        <TopQuestions
          from={[devops, goroutines, databases]}
          ids={[
            'devops-epoll',
            'devops-file-descriptor',
            'goroutines-scheduler-netpoller',
            'goroutines-scheduler-syscalls-handoff',
            'devops-syscalls',
            'devops-ipc-mechanisms',
            'databases-wal',
          ]}
        />
      </Section>
      <NextTopic slug="os-io" />
    </>
  )
}
