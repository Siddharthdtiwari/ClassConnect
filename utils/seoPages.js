// Content for the public, crawlable landing pages (served by routes/seoRoutes.js).
// Every fact here (fees, timings, address, mediums) mirrors the home page; if you change
// fees or timings in views/index.ejs, change them here too.

const SITE = {
  name: 'Tuition Hub Education Centre',
  baseUrl: process.env.BASE_URL || 'https://tuitionhub.vercel.app',
  // Matches the Google Business Profile listing character for character (NAP consistency).
  address: 'Chhabinath Pandey Chawl, Airport Road, Near The Lalit Hotel, Navpada, Marol Naka, Andheri East, Mumbai, Maharashtra 400059',
  phones: [
    { display: '099674 66955', tel: '+919967466955' },
    { display: '084518 26909', tel: '+918451826909' }
  ],
  orgId: '/#organization'
};

const MEDIUMS = 'English, Hindi and Semi-English';

const BANDS = {
  primary: {
    label: 'Nursery to Class 4',
    fees: [
      ['Jr. KG & Sr. KG', '₹400', '₹4,000'],
      ['Class 1 & 2', '₹450', '₹4,500'],
      ['Class 3 & 4', '₹500', '₹5,000']
    ],
    timings: [['Morning batch', 'Mon – Sat', '9:00 – 11:00 AM'], ['Evening batch', 'Mon – Sat', '5:00 – 7:00 PM']]
  },
  middle: {
    label: 'Class 5 to 7',
    fees: [['Class 5', '₹550', '₹5,500'], ['Class 6', '₹600', '₹6,000'], ['Class 7', '₹700', '₹7,000']],
    timings: [['Morning batch', 'Mon – Sat', '8:15 – 11:15 AM'], ['Evening batch', 'Mon – Sat', '4:00 – 7:00 PM']]
  },
  secondary: {
    label: 'Class 8 to 10',
    fees: [['Class 8', '₹800', '₹8,000'], ['Class 9', '₹900', '₹9,000'], ['Class 10', '₹1,000', '₹10,000']],
    timings: [['Morning batch', 'Mon – Sat', '8:15 – 11:15 AM'], ['Evening batch', 'Mon – Sat', '4:00 – 7:00 PM']]
  }
};

const COMMON_FEE_NOTE = 'Monthly fees are due between the 1st and 10th of each month. An annual option is due on 10 August.';

const PAGES = [
  {
    slug: 'tuition-in-marol-andheri-east',
    crumb: 'Tuition in Marol, Andheri East',
    title: 'Tuition in Marol, Andheri East: Nursery–Class 10 | Tuition Hub',
    description: 'Tuition near Marol Naka, Andheri East for Nursery to Class 10: English, Hindi and Semi-English, small batches, weekly tests. Fees from ₹400/month.',
    h1: 'Tuition in Marol, Andheri East',
    intro: `Tuition Hub Education Centre is a neighbourhood tuition centre on Airport Road, near The Lalit Hotel in Navpada, Marol Naka. We teach Nursery to Class 10 in ${MEDIUMS} mediums, in small batches with weekly tests, and parents can follow attendance, scores and fees on our portal.`,
    bands: ['primary', 'middle', 'secondary'],
    sections: [
      {
        h2: 'Where we are and who we serve',
        paras: [
          `We are at ${SITE.address}. The centre is close to the Marol Naka junction, so students from Marol, Chakala, Sakinaka and the rest of Andheri East can reach us without a long commute.`,
          'Parents can meet the teachers every day during consultation hours, 7:30 – 8:30 PM, to talk about their child\'s progress.'
        ]
      },
      {
        h2: 'What a Tuition Hub batch looks like',
        list: [
          'Small batches, so every child gets individual attention.',
          'Weekly tests, with results published on the portal as soon as they are marked.',
          'Dedicated doubt-solving time before moving to the next chapter.',
          'Daily maths practice, 7 – 8 PM.',
          'Morning and evening batches, Monday to Saturday, so the schedule fits school timings.'
        ]
      },
      {
        h2: 'What to ask any tuition centre before you join',
        paras: ['Whatever centre you choose, these questions separate a good one from an average one:'],
        list: [
          'How many students are in a batch, and who teaches each subject?',
          'How often are tests held, and will I see the results?',
          'How will I know if my child is absent or falling behind?',
          'What exactly are the fees, and when are they due? Is there any other charge?',
          'Can I meet the teacher regularly, not only at the start of the year?'
        ]
      }
    ],
    hindi: 'ट्यूशन हब एजुकेशन सेंटर, मरोळ नाका (अंधेरी ईस्ट, मुंबई) में नर्सरी से कक्षा 10 तक की ट्यूशन देता है। अंग्रेज़ी, हिंदी और सेमी-इंग्लिश माध्यम में छोटे बैच, साप्ताहिक टेस्ट और माता-पिता के लिए डिजिटल पोर्टल। संपर्क: 099674 66955।',
    faqs: [
      ['Is there a tuition centre near Marol Naka for Nursery to Class 10?', `Yes. Tuition Hub Education Centre is on Airport Road near The Lalit Hotel, Navpada, Marol Naka, and teaches Nursery to Class 10 in ${MEDIUMS} mediums.`],
      ['How much does tuition cost in Marol at Tuition Hub?', `Fees run from ₹400 per month for Jr. KG and Sr. KG up to ₹1,000 per month for Class 10. ${COMMON_FEE_NOTE}`],
      ['Do you teach in Hindi or Marathi medium?', 'We teach in English, Hindi and Semi-English mediums. Call us to ask about other arrangements.'],
      ['Which areas do students come from?', 'Mostly Marol, Marol Naka, Chakala, Sakinaka and other parts of Andheri East.']
    ]
  },
  {
    slug: 'nursery-to-class-4-tuition-marol',
    crumb: 'Nursery to Class 4 tuition',
    title: 'Nursery to Class 4 Tuition in Marol, Andheri East | Tuition Hub',
    description: 'Tuition for Jr. KG, Sr. KG and Classes 1 to 4 near Marol Naka, Andheri East. Morning 9–11 AM and evening 5–7 PM batches, fees ₹400–₹500 per month.',
    h1: 'Nursery to Class 4 tuition in Marol',
    intro: `The early years decide whether a child enjoys learning. Our Nursery to Class 4 batches near Marol Naka are small, run in ${MEDIUMS} mediums, and focus on reading, writing, number sense and a steady daily routine.`,
    bands: ['primary'],
    sections: [
      {
        h2: 'How the primary batches work',
        list: [
          'Two batches, Monday to Saturday: 9:00 – 11:00 AM and 5:00 – 7:00 PM.',
          'Small groups, so a young child is never lost in the crowd.',
          'Regular tests that build exam habits gently, with results shared with parents.',
          'Daily maths practice, 7 – 8 PM, available to all classes.'
        ]
      },
      {
        h2: 'Working with parents',
        paras: [
          'Parents can meet teachers daily between 7:30 and 8:30 PM. The Tuition Hub portal shows attendance, test scores and fee status, so you do not have to wait for a meeting to know how your child is doing.'
        ]
      }
    ],
    faqs: [
      ['What are the Nursery tuition fees in Marol at Tuition Hub?', `Jr. KG and Sr. KG are ₹400 per month (₹4,000 yearly). Classes 1 and 2 are ₹450, Classes 3 and 4 are ₹500. ${COMMON_FEE_NOTE}`],
      ['What are the batch timings for Nursery to Class 4?', 'Morning 9:00 – 11:00 AM or evening 5:00 – 7:00 PM, Monday to Saturday.'],
      ['Which mediums are available?', `${MEDIUMS} mediums.`],
      ['Can I see how my young child is doing?', 'Yes. Parents get portal access to attendance, test scores and fees, and can meet teachers daily from 7:30 to 8:30 PM.']
    ]
  },
  {
    slug: 'class-5-to-7-tuition-andheri-east',
    crumb: 'Class 5 to 7 tuition',
    title: 'Class 5, 6 & 7 Tuition in Andheri East (Marol) | Tuition Hub',
    description: 'Tuition for Class 5, 6 and 7 near Marol Naka, Andheri East. Morning 8:15–11:15 AM and evening 4–7 PM batches, small groups, weekly tests, ₹550–₹700 per month.',
    h1: 'Class 5 to 7 tuition in Andheri East',
    intro: `Classes 5 to 7 are where subjects multiply and homework gets harder. Our middle-school batches near Marol Naka keep groups small, test every week, and set aside time to clear doubts before a weak chapter becomes a weak subject. Mediums: ${MEDIUMS}.`,
    bands: ['middle'],
    sections: [
      {
        h2: 'How the middle-school batches work',
        list: [
          'Two batches, Monday to Saturday: 8:15 – 11:15 AM and 4:00 – 7:00 PM.',
          'Weekly tests with scores on the portal, so gaps show up early.',
          'Doubt-solving time built into the schedule.',
          'Daily maths practice, 7 – 8 PM.'
        ]
      },
      {
        h2: 'Keeping parents informed',
        paras: ['Attendance, test results, rankings and fee status are on the Tuition Hub portal. Teachers are available for parent consultation daily, 7:30 – 8:30 PM.']
      }
    ],
    faqs: [
      ['What are the Class 5, 6 and 7 tuition fees?', `Class 5 is ₹550 per month, Class 6 is ₹600 and Class 7 is ₹700 (yearly ₹5,500, ₹6,000 and ₹7,000). ${COMMON_FEE_NOTE}`],
      ['What are the batch timings for Class 5 to 7?', 'Morning 8:15 – 11:15 AM or evening 4:00 – 7:00 PM, Monday to Saturday.'],
      ['How often are tests held?', 'Weekly. Results are published on the portal after marking.'],
      ['Which mediums are available?', `${MEDIUMS} mediums.`]
    ]
  },
  {
    slug: 'class-8-to-10-tuition-andheri-east',
    crumb: 'Class 8 to 10 tuition',
    title: 'Class 8, 9 & 10 Tuition in Andheri East, Marol | Tuition Hub',
    description: 'Class 8, 9 and 10 tuition near Marol Naka, Andheri East: small batches, weekly tests, doubt solving, parent portal. ₹800–₹1,000 per month.',
    h1: 'Class 8 to 10 tuition in Andheri East',
    intro: `Classes 8 to 10 need steady practice, not last-minute cramming. Our secondary batches near Marol Naka combine weekly tests, dedicated doubt-solving and a clear view of progress for parents, in ${MEDIUMS} mediums.`,
    bands: ['secondary'],
    sections: [
      {
        h2: 'How the secondary batches work',
        list: [
          'Two batches, Monday to Saturday: 8:15 – 11:15 AM and 4:00 – 7:00 PM.',
          'Weekly tests, with percentage and rank views on the portal.',
          'Individual doubt-solving before moving to the next chapter.',
          'Daily maths practice, 7 – 8 PM.'
        ]
      },
      {
        h2: 'Tracking progress through the year',
        paras: ['Students see their score history and rank on the portal; parents see attendance, scores and fee status. Teachers are available for consultation daily, 7:30 – 8:30 PM, if you want to discuss a specific subject.']
      }
    ],
    faqs: [
      ['What are the Class 8, 9 and 10 tuition fees?', `Class 8 is ₹800 per month, Class 9 is ₹900 and Class 10 is ₹1,000 (yearly ₹8,000, ₹9,000 and ₹10,000). ${COMMON_FEE_NOTE}`],
      ['What are the batch timings for Class 8 to 10?', 'Morning 8:15 – 11:15 AM or evening 4:00 – 7:00 PM, Monday to Saturday.'],
      ['Is there doubt-solving time?', 'Yes. Dedicated time is set aside so each concept is clear before the next chapter starts.'],
      ['Which mediums are available?', `${MEDIUMS} mediums.`]
    ]
  }
];

module.exports = { SITE, BANDS, PAGES, COMMON_FEE_NOTE };
