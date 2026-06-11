// Official PF resolutions. Users pick from this list instead of typing a topic.
// `tag` is the event/month, `text` is the resolution stored on the round.

export interface Topic {
  tag: string;
  text: string;
}

export const TOPICS: Topic[] = [
  // 2025-2026
  { tag: "Nationals 2026", text: "Resolved: The United States is justified in using force to remove authoritarian leaders from power." },
  { tag: "April 2026", text: "Resolved: The United States should eliminate the President’s authority to deploy military forces abroad without Congressional approval." },
  { tag: "March 2026", text: "Resolved: The United States federal government should ban corporate acquisition of single-family residences." },
  { tag: "February 2026", text: "Resolved: The Federal Trade Commission should establish a federal regulatory framework for sports betting." },
  { tag: "January 2026", text: "Resolved: The People’s Republic of China should substantially reduce its international extraction of natural resources." },
  { tag: "November/December 2025", text: "Resolved: The United States federal government should require technology companies to provide lawful access to encrypted communications." },
  { tag: "September/October 2025", text: "Resolved: The United Kingdom should rejoin the European Union." },

  // 2024-2025
  { tag: "Nationals 2025", text: "Resolved: On balance, in the United States, the benefits of presidential executive orders outweigh the harms." },
  { tag: "April 2025", text: "Resolved: The United States federal government should substantially increase its investment in domestic nuclear energy." },
  { tag: "March 2025", text: "Resolved: In the United States, the benefits of the use of generative artificial intelligence in education outweigh the harms." },
  { tag: "February 2025", text: "Resolved: The United States should accede to the Rome Statute of the International Criminal Court." },
  { tag: "January 2025", text: "Resolved: The African Union should grant diplomatic recognition to the Republic of Somaliland as an independent state." },
  { tag: "November/December 2024", text: "Resolved: The United States should substantially reduce its military support of Taiwan." },
  { tag: "September/October 2024", text: "Resolved: The United States federal government should substantially expand its surveillance infrastructure along its southern border." },

  // 2023-2024
  { tag: "Nationals 2024", text: "Resolved: The United States should establish a comprehensive bilateral trade agreement with the European Union." },
  { tag: "April 2024", text: "Resolved: The United Nations should abolish permanent membership on its Security Council." },
  { tag: "March 2024", text: "Resolved: In the United States, collegiate student-athletes should be classified as employees of their educational institution." },
  { tag: "February 2024", text: "Resolved: The United States federal government should ban single-use plastics." },
  { tag: "January 2024", text: "Resolved: The United States federal government should repeal Section 230 of the Communications Decency Act." },
  { tag: "November/December 2023", text: "Resolved: The United States federal government should forgive all federal student loan debt." },
  { tag: "September/October 2023", text: "Resolved: The United States federal government should substantially increase its military presence in the Arctic." },

  // 2022-2023
  { tag: "Nationals 2023", text: "Resolved: The United States should adopt ranked-choice voting for its federal elections." },
  { tag: "April 2023", text: "Resolved: The United States Federal Government should ban the collection of personal data through biometric recognition technology." },
  { tag: "March 2023", text: "Resolved: The Republic of India should sign the Artemis Accords." },
  { tag: "February 2023", text: "Resolved: In the United States, right-to-work laws do more harm than good." },
  { tag: "January 2023", text: "Resolved: The United States Federal Government should increase its diplomatic efforts to peacefully resolve internal armed conflicts in West Asia." },
  { tag: "November/December 2022", text: "Resolved: The United States’ strategy of Great Power Competition produces more benefits than harms." },
  { tag: "September/October 2022", text: "Resolved: The United States Federal Government should substantially increase its investment in high-speed rail." },

  // 2021-2022
  { tag: "Nationals 2022", text: "Resolved: The United States should establish a comprehensive bilateral trade agreement with Taiwan." },
  { tag: "April 2022", text: "Resolved: Japan should revise Article 9 of its Constitution to develop offensive military capabilities." },
  { tag: "March 2022", text: "Resolved: In the United States, the benefits of increasing organic agriculture outweigh the harms." },
  { tag: "February 2022", text: "Resolved: On balance, Turkey’s membership is beneficial to the North Atlantic Treaty Organization." },
  { tag: "January 2022", text: "Resolved: The United States federal government should legalize all illicit drugs." },
  { tag: "November/December 2021", text: "Resolved: Increased United States federal regulation of cryptocurrency transactions and/or assets will produce more benefits than harms." },
  { tag: "September/October 2021", text: "Resolved: The North Atlantic Treaty Organization should substantially increase its defense commitments to the Baltic states." },

  // 2020-2021
  { tag: "Nationals 2021", text: "Resolved: In the United States, social media is beneficial for democratic values." },
  { tag: "April 2021", text: "Resolved: The benefits of the International Monetary Fund outweigh the harms." },
  { tag: "March 2021", text: "Resolved: On balance, the benefits of creating the United States Space Force outweigh the harms." },
  { tag: "February 2021", text: "Resolved: On balance, the benefits of urbanization in West Africa outweigh the harms." },
  { tag: "January 2021", text: "Resolved: The National Security Agency should end its surveillance of U.S. citizens and lawful permanent residents." },
  { tag: "November/December 2020", text: "Resolved: The United States should adopt a declaratory nuclear policy of no first use." },
  { tag: "September/October 2020", text: "Resolved: The United States federal government should enact the Medicare-For-All Act of 2019." },

  // 2019-2020
  { tag: "Nationals 2020", text: "Resolved: On balance, charter schools are beneficial to the quality of education in the United States." },
  { tag: "April 2020", text: "Resolved: The United States should remove nearly all of its military presence in the Arab States of the Persian Gulf." },
  { tag: "March 2020", text: "Resolved: The United States should increase its use of nuclear energy for commercial energy production." },
  { tag: "February 2020", text: "Resolved: The United States should replace means-tested welfare programs with a universal basic income." },
  { tag: "January 2020", text: "Resolved: The United States should end its economic sanctions against Venezuela." },
  { tag: "November/December 2019", text: "Resolved: The benefits of the United States federal government’s use of offensive cyber operations outweigh the harms." },
  { tag: "September/October 2019", text: "Resolved: The European Union should join the Belt and Road Initiative." },

  // 2018-2019
  { tag: "Nationals 2019", text: "Resolved: The United States federal government should enforce antitrust regulations on technology giants." },
  { tag: "April 2019", text: "Resolved: The United Nations should grant India permanent membership on the Security Council." },
  { tag: "March 2019", text: "Resolved: The United States should promote the development of market rate housing in urban neighborhoods." },
  { tag: "February 2019", text: "Resolved: The United States should end its arms sales to Saudi Arabia." },
  { tag: "January 2019", text: "Resolved: The United States federal government should prioritize reducing the federal debt over promoting economic growth." },
  { tag: "November/December 2018", text: "Resolved: The United States federal government should impose price controls on the pharmaceutical industry." },
  { tag: "September/October 2018", text: "Resolved: The United States should accede to the United Nations Convention on the Law of the Sea without reservations." },

  // 2017-2018
  { tag: "Nationals 2018", text: "Resolved: On balance, the benefits of United States participation in the North American Free Trade Agreement outweigh the consequences." },
  { tag: "April 2018", text: "Resolved: The United States federal government should increase its quota of H-1B visas." },
  { tag: "March 2018", text: "Resolved: On balance, the current Authorization for Use of Military Force gives too much power to the president." },
  { tag: "February 2018", text: "Resolved: The United States should abolish the capital gains tax." },
  { tag: "January 2018", text: "Resolved: Spain should grant Catalonia its independence." },
  { tag: "December 2017", text: "Resolved: NCAA student athletes ought to be recognized as employees under the Fair Labor Standards Act." },
  { tag: "November 2017", text: "Resolved: The United States should require universal background checks for all gun sales and transfers of ownership." },
  { tag: "September/October 2017", text: "Resolved: Deployment of anti-missile systems is in South Korea’s best interest." },
];

export function searchTopics(query: string, limit = 8): Topic[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/);
  return TOPICS.filter(t => {
    const hay = (t.tag + " " + t.text).toLowerCase();
    return terms.every(term => hay.includes(term));
  }).slice(0, limit);
}
